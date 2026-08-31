#!/usr/bin/env python3
"""Minimal PairTeX localhost review server.

This first slice owns local project metadata, HTML presentation, and feedback
entry persistence. It never edits manuscript source files.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from pairtex_validation import validate_rendered_html

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "pairtex" / "static"


def git_value(project: Path, *args: str, fallback: str = "") -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(project), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return fallback
    return result.stdout.strip()


def project_state(project: Path) -> dict[str, object]:
    head = git_value(project, "rev-parse", "HEAD", fallback="uncommitted")
    dirty = bool(git_value(project, "status", "--porcelain"))
    author = git_value(project, "config", "user.name") or None
    return {
        "project": str(project),
        "head_commit": head,
        "worktree_dirty": dirty,
        "author": author,
    }


def load_entries(project: Path) -> list[dict[str, object]]:
    directory = project / ".pairtex" / "feedback"
    if not directory.exists():
        return []
    entries = []
    for path in sorted(directory.glob("*.json")):
        try:
            entries.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return entries


class App:
    def __init__(self, project: Path, html_path: Path):
        self.project = project.resolve()
        self.html_path = html_path.resolve()
        validate_rendered_html(self.html_path.read_text(encoding="utf-8"))

    def state(self) -> dict[str, object]:
        html = self.html_path.read_text(encoding="utf-8")
        return {
            **project_state(self.project),
            "manuscript_html": html,
            "entries": load_entries(self.project),
        }

    def save_entry(self, entry: dict[str, object]) -> dict[str, object]:
        directory = self.project / ".pairtex" / "feedback"
        directory.mkdir(parents=True, exist_ok=True)
        entry_id = str(entry.get("id") or uuid.uuid4().hex)
        if Path(entry_id).name != entry_id:
            raise ValueError("invalid entry id")
        entry["id"] = entry_id
        path = directory / f"{entry_id}.json"
        path.write_text(
            json.dumps(entry, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return entry

    def delete_entry(self, entry_id: str) -> None:
        if Path(entry_id).name != entry_id:
            raise ValueError("invalid entry id")
        path = self.project / ".pairtex" / "feedback" / f"{entry_id}.json"
        path.unlink()


class Handler(BaseHTTPRequestHandler):
    app: App

    def send_bytes(self, body: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/":
            body = (STATIC_DIR / "index.html").read_bytes()
            self.send_bytes(body, "text/html; charset=utf-8")
            return
        if path == "/api/state":
            body = json.dumps(self.app.state(), ensure_ascii=False).encode("utf-8")
            self.send_bytes(body, "application/json; charset=utf-8")
            return
        if path == "/theme.js":
            project_theme = self.app.project / ".pairtex" / "theme.js"
            body = project_theme.read_bytes() if project_theme.is_file() else b"window.PairTeXCustomPalettes = {};\n"
            self.send_bytes(body, "application/javascript; charset=utf-8")
            return
        if path in {"/app.js", "/style.css", "/themes.js"}:
            file_path = STATIC_DIR / path.lstrip("/")
            content_type = mimetypes.guess_type(file_path.name)[0] or "text/plain"
            self.send_bytes(file_path.read_bytes(), f"{content_type}; charset=utf-8")
            return
        resource = unquote(path.lstrip("/"))
        resource_path = (self.app.html_path.parent / resource).resolve()
        html_root = self.app.html_path.parent.resolve()
        if resource_path.is_relative_to(html_root) and resource_path.is_file():
            content_type = mimetypes.guess_type(resource_path.name)[0] or "application/octet-stream"
            self.send_bytes(resource_path.read_bytes(), content_type)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/entries":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            entry = json.loads(self.rfile.read(length))
            if not isinstance(entry, dict):
                raise ValueError("entry must be an object")
            saved = self.app.save_entry(entry)
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_bytes(body, "application/json; charset=utf-8", HTTPStatus.BAD_REQUEST)
            return
        body = json.dumps(saved, ensure_ascii=False).encode("utf-8")
        self.send_bytes(body, "application/json; charset=utf-8", HTTPStatus.CREATED)

    def do_PUT(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        prefix = "/api/entries/"
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        entry_id = path[len(prefix):]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            entry = json.loads(self.rfile.read(length))
            if not isinstance(entry, dict):
                raise ValueError("entry must be an object")
            existing_path = self.app.project / ".pairtex" / "feedback" / f"{entry_id}.json"
            if existing_path.exists():
                existing = json.loads(existing_path.read_text(encoding="utf-8"))
                if existing.get("status", "open") != entry.get("status", "open"):
                    raise ValueError("feedback lifecycle is managed by the source-side workflow")
            entry["id"] = entry_id
            saved = self.app.save_entry(entry)
        except (ValueError, json.JSONDecodeError, OSError) as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_bytes(body, "application/json; charset=utf-8", HTTPStatus.BAD_REQUEST)
            return
        body = json.dumps(saved, ensure_ascii=False).encode("utf-8")
        self.send_bytes(body, "application/json; charset=utf-8")

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        prefix = "/api/entries/"
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            self.app.delete_entry(path[len(prefix):])
        except (ValueError, OSError) as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_bytes(body, "application/json; charset=utf-8", HTTPStatus.NOT_FOUND)
            return
        self.send_bytes(b"", "application/json; charset=utf-8", HTTPStatus.NO_CONTENT)

    def log_message(self, format: str, *args: object) -> None:
        print(format % args, file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the PairTeX localhost review app")
    parser.add_argument("--project", type=Path, required=True, help="Target LaTeX repository")
    parser.add_argument("--html", type=Path, required=True, help="Rendered HTML fragment")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    project = args.project.resolve()
    html_path = args.html.resolve()
    if not project.is_dir():
        parser.error(f"project directory not found: {project}")
    if not html_path.is_file():
        parser.error(f"HTML file not found: {html_path}")

    app = App(project, html_path)
    handler = type("PairTeXHandler", (Handler,), {"app": app})
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"PairTeX running at http://{args.host}:{args.port}/", flush=True)
    print(f"Project: {project}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping PairTeX.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
