"""Run a TeX-to-HTML renderer in a disposable project copy.

The renderer is deliberately an adapter boundary. PairTeX never runs a
renderer in the user's working tree and never publishes output that contains
reported renderer errors or missing local assets.
"""

from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path


ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        source = attributes.get("src")
        if source and not source.startswith(("http://", "https://", "data:", "#")):
            self.sources.append(source.split("?", 1)[0].split("#", 1)[0])


def renderer_errors(output: str) -> list[str]:
    output = ANSI_ESCAPE.sub("", output)
    patterns = (
        r"\[ERROR\].*",
        r"\[FATAL\].*",
        r"Compilation errors in the htlatex run",
        r"Fatal error occurred",
        r"Undefined control sequence",
    )
    return [line.strip() for line in output.splitlines() if any(re.search(pattern, line) for pattern in patterns)]


def missing_assets(html_path: Path, sources: list[str]) -> list[str]:
    return sorted({source for source in sources if not (html_path.parent / source).is_file()})


def materialize_pdf_assets(project: Path, html_path: Path, sources: list[str]) -> None:
    """Create simple raster fallbacks for PDF figures in the disposable copy."""
    for source in missing_assets(html_path, sources):
        if not source.lower().endswith(".png"):
            continue
        basename = Path(source).stem.removesuffix("-")
        pdf_candidates = sorted(project.rglob(f"{basename}.pdf"))
        if not pdf_candidates:
            continue
        destination = html_path.parent / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["magick", "-density", "144", f"{pdf_candidates[0]}[0]", str(destination)],
            capture_output=True,
            text=True,
            check=False,
        )


def run_make4ht(
    project: Path,
    input_path: Path,
    output: Path,
    texinputs: str | None,
    tex4ht_options: str,
    build_command: str | None,
) -> None:
    input_path = input_path.resolve()
    project = project.resolve()
    if not project.is_dir():
        raise ValueError(f"Project directory not found: {project}")
    if not input_path.is_relative_to(project):
        raise ValueError("Input manuscript must be inside the project directory")
    if not input_path.is_file():
        raise ValueError(f"Input manuscript not found: {input_path}")

    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pairtex-render-") as temp_name:
        disposable = Path(temp_name) / "project"
        shutil.copytree(project, disposable, symlinks=True)
        disposable_input = disposable / input_path.relative_to(project)
        cwd = disposable_input.parent
        environment = os.environ.copy()
        if texinputs:
            environment["TEXINPUTS"] = texinputs + environment.get("TEXINPUTS", "")
        build_directory = "build"

        if build_command:
            build = subprocess.run(
                [part.format(input=disposable_input.name) for part in shlex.split(build_command)],
                cwd=cwd,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            if build.returncode != 0:
                raise RuntimeError(
                    "Project build rejected before HTML rendering:\n"
                    + (build.stdout + build.stderr).strip()
                )

        result = subprocess.run(
            ["make4ht", "-B", build_directory, disposable_input.name, tex4ht_options],
            cwd=cwd,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        transcript = result.stdout + result.stderr
        errors = renderer_errors(transcript)
        html_path = cwd / build_directory / f"{disposable_input.stem}.html"
        if result.returncode != 0:
            errors.append(f"renderer exited with status {result.returncode}")
        if not html_path.is_file():
            errors.append(f"renderer did not produce {html_path.name}")

        if html_path.is_file():
            parser = AssetParser()
            parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
            materialize_pdf_assets(disposable, html_path, parser.sources)
            missing = missing_assets(html_path, parser.sources)
            errors.extend(f"missing HTML asset: {source}" for source in missing)

        if errors:
            raise RuntimeError("Renderer output rejected:\n" + "\n".join(f"- {error}" for error in errors))

        output.mkdir(parents=True, exist_ok=True)
        shutil.copy2(html_path, output / html_path.name)
        for source in parser.sources:
            source_path = html_path.parent / source
            destination = output / source
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)
        css_files = sorted(html_path.parent.glob("*.css"))
        for css_path in css_files:
            shutil.copy2(css_path, output / css_path.name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a LaTeX project in a disposable copy")
    parser.add_argument("--project", type=Path, required=True, help="Target LaTeX project")
    parser.add_argument("--input", type=Path, required=True, help="Manuscript root relative to --project")
    parser.add_argument("--output", type=Path, required=True, help="Directory receiving accepted HTML output")
    parser.add_argument("--texinputs", help="Optional TEXINPUTS prefix required by the project renderer")
    parser.add_argument("--tex4ht-options", default="xhtml,mathml", help="TeX4ht style options (default: xhtml,mathml)")
    parser.add_argument(
        "--build-command",
        help="Optional project build command run before rendering; use {input} for the manuscript filename",
    )
    args = parser.parse_args()
    try:
        run_make4ht(
            args.project,
            args.project / args.input,
            args.output,
            args.texinputs,
            args.tex4ht_options,
            args.build_command,
        )
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f"Accepted renderer output: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
