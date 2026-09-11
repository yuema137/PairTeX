"""Run a TeX-to-HTML renderer in a disposable project copy.

The renderer is deliberately an adapter boundary. PairTeX never runs a
renderer in the user's working tree and never publishes output that contains
reported renderer errors or missing local assets.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from pairtex import __version__
from pairtex_validation import validate_rendered_html


ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
MATH_ENVIRONMENT = re.compile(
    r"\\begin\{(?P<environment>equation\*?|align\*?|gather\*?|multline\*?|flalign\*?)\}"
    r"(?P<body>.*?)"
    r"\\end\{(?P=environment)\}",
    re.DOTALL,
)
MATH_INLINE = re.compile(r"\\\[(.*?)\\\]|\\\((.*?)\\\)|(?<!\\)\$\$(.*?)\$\$|(?<!\\)\$(?!\$)(.*?)(?<!\\)\$", re.DOTALL)
INPUT_COMMAND = re.compile(r"\\(?:input|include)\s*\{([^}]+)\}")


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        for attribute in ("src", "href"):
            source = attributes.get(attribute)
            if not source:
                continue
            url = urlsplit(source)
            if url.scheme == "file":
                raise ValueError(f"unsafe local HTML asset: {source}")
            if url.scheme or url.netloc or not url.path:
                continue
            path = unquote(url.path)
            if path.startswith("/") or "\\" in path or ".." in Path(path).parts or "\x00" in path:
                raise ValueError(f"unsafe local HTML asset: {source}")
            self.sources.append(path)


class MathAnnotationParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.has_annotations = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if dict(attrs).get("data-editable") == "math":
            self.has_annotations = True


def asset_path(root: Path, source: str) -> Path:
    path = root / source
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"HTML asset escapes permitted directory: {source}")
    return path


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
    return sorted({source for source in sources if not asset_path(html_path.parent, source).is_file()})


def materialize_pdf_assets(project: Path, html_path: Path, sources: list[str]) -> None:
    """Create simple raster fallbacks for PDF figures in the disposable copy."""
    for source in missing_assets(html_path, sources):
        if not source.lower().endswith(".png"):
            continue
        basename = Path(source).stem.removesuffix("-")
        pdf_candidates = sorted(path for path in project.rglob(f"{basename}.pdf")
                                if path.resolve().is_relative_to(project.resolve()))
        if not pdf_candidates:
            continue
        destination = asset_path(html_path.parent, source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["magick", "-density", "144", f"{pdf_candidates[0]}[0]", str(destination)],
            capture_output=True,
            text=True,
            check=False,
        )


def materialize_project_assets(project: Path, html_path: Path, sources: list[str]) -> None:
    """Copy source assets referenced by the renderer into the disposable output."""
    for source in missing_assets(html_path, sources):
        candidate = asset_path(project, source)
        if not candidate.is_file():
            continue
        destination = asset_path(html_path.parent, source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate, destination)


def strip_tex_comment(line: str) -> str:
    escaped = False
    for index, char in enumerate(line):
        if char == "%" and not escaped:
            return line[:index]
        escaped = char == "\\" and not escaped
        if char != "\\":
            escaped = False
    return line


def resolve_input(project: Path, current_file: Path, name: str, search_roots: list[Path] | None = None) -> Path | None:
    candidate = Path(name)
    options = [current_file.parent / candidate, project / candidate]
    options.extend(root / candidate for root in search_roots or [])
    if candidate.suffix != ".tex":
        options.extend(path.with_suffix(".tex") for path in list(options))
    return next((path.resolve() for path in options if path.is_file()), None)


def source_math(
    project: Path,
    path: Path,
    root: bool = False,
    seen: set[Path] | None = None,
    search_roots: list[Path] | None = None,
) -> list[dict[str, object]]:
    project = project.resolve()
    seen = seen or set()
    path = path.resolve()
    if path in seen:
        return []
    seen.add(path)
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    first_line = 1
    if root:
        try:
            start = next(index for index, line in enumerate(lines) if "\\begin{document}" in line) + 1
            # Retain text on the document-opening line and its real source line.
            lines = lines[start - 1:]
            lines[0] = lines[0].split("\\begin{document}", 1)[1]
            first_line = start
        except StopIteration:
            pass
    expanded: list[dict[str, object]] = []
    for line_number, raw_line in enumerate(lines, start=first_line):
        line = strip_tex_comment(raw_line)
        input_match = INPUT_COMMAND.fullmatch(line.strip())
        if input_match:
            included = resolve_input(project, path, input_match.group(1), search_roots)
            if included:
                expanded.extend(source_lines(project, included, seen, search_roots))
            continue
        expanded.append({"text": line, "file": path, "line": line_number})
    text = "\n".join(str(item["text"]) for item in expanded)
    origins: list[tuple[Path, int]] = []
    for index, item in enumerate(expanded):
        origin = (Path(str(item["file"])), int(item["line"]))
        origins.extend(origin for _ in range(len(str(item["text"]))))
        if index < len(expanded) - 1:
            origins.append(origin)
    matches = list(MATH_ENVIRONMENT.finditer(text))
    occupied = [(match.start(), match.end()) for match in matches]
    matches.extend(match for match in MATH_INLINE.finditer(text) if not any(start <= match.start() < end for start, end in occupied))
    matches.sort(key=lambda match: match.start())
    result = []
    for match in matches:
        source = (match.groupdict().get("body") if match.re is MATH_ENVIRONMENT else next(
            (group for group in match.groups() if group is not None), ""
        )).strip()
        if not source:
            continue
        source_path, source_line = origins[min(match.start(), len(origins) - 1)]
        result.append({"source": source, "file": str(source_path.relative_to(project)), "line": source_line})
    return result


def source_lines(
    project: Path,
    path: Path,
    seen: set[Path],
    search_roots: list[Path] | None = None,
) -> list[dict[str, object]]:
    project = project.resolve()
    lines = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1):
        line = strip_tex_comment(raw_line)
        input_match = INPUT_COMMAND.fullmatch(line.strip())
        if input_match:
            included = resolve_input(project, path, input_match.group(1), search_roots)
            if included and included not in seen:
                seen.add(included)
                lines.extend(source_lines(project, included, seen, search_roots))
            else:
                lines.append({"text": line, "file": path, "line": line_number})
        else:
            lines.append({"text": line, "file": path, "line": line_number})
    return lines


def annotate_math_sources(
    project: Path,
    input_path: Path,
    html_path: Path,
    search_roots: list[Path] | None = None,
) -> None:
    html_text = html_path.read_text(encoding="utf-8")
    # Adapters providing explicit anchors own their source mapping.
    annotations = MathAnnotationParser()
    annotations.feed(html_text)
    if annotations.has_annotations:
        return
    expanded = source_lines(project, input_path, {input_path.resolve()}, search_roots)
    source_text = "\n".join(str(item["text"]) for item in expanded)
    # A static scan is not TeX execution. Even equal counts can pair different
    # formulas when conditionals, bibliographies or macro expansion are involved.
    uncertain = bool(re.search(
        r"\\(?:if\w*|else|fi|bibliography|printbibliography|addbibresource|"
        r"def|edef|gdef|xdef|newcommand|renewcommand|providecommand|"
        r"newenvironment|renewenvironment|input|include|includeonly)\b", source_text
    ))
    try:
        math_sources = [] if uncertain else source_math(project, input_path, root=True, search_roots=search_roots)
    except ValueError:
        # Sources found through TEXINPUTS may live outside the canonical project.
        uncertain, math_sources = True, []
    math_pattern = re.compile(r"<math\b[^>]*>.*?</math>", re.DOTALL | re.IGNORECASE)
    rendered_math = list(math_pattern.finditer(html_text))
    if uncertain or len(math_sources) != len(rendered_math):
        if rendered_math:
            reason = "TeX expansion requires renderer-provided anchors" if uncertain else "source and rendered formula counts differ"
            print(f"Math source mapping unavailable: {reason}; formulas remain read-only. "
                  "Use an adapter with explicit source anchors to enable formula editing.", file=sys.stderr)
            for match in reversed(rendered_math):
                wrapper = ('<span class="pairtex-math" data-source-mapping="unmapped" contenteditable="false" '
                           'title="Read-only formula: source mapping unavailable">'
                           + match.group(0) + '</span>')
                html_text = html_text[:match.start()] + wrapper + html_text[match.end():]
            html_path.write_text(html_text, encoding="utf-8")
        return
    for match, item in reversed(list(zip(rendered_math, math_sources))):
        source = html.escape(str(item["source"]), quote=True)
        wrapper = (
            f'<span class="pairtex-math" data-editable="math" '
            f'data-source-file="{html.escape(str(item["file"]), quote=True)}" '
            f'data-source-line="{item["line"]}" data-math-source="{source}">'
            f'<span class="math-render">{match.group(0)}</span></span>'
        )
        html_text = html_text[:match.start()] + wrapper + html_text[match.end():]
    html_path.write_text(html_text, encoding="utf-8")


def normalize_html_document(html_path: Path) -> None:
    """Drop renderer diagnostics accidentally emitted before the HTML document."""
    html_text = html_path.read_text(encoding="utf-8")
    doctype = html_text.lower().find("<!doctype html>")
    if doctype > 0:
        html_path.write_text(html_text[doctype:], encoding="utf-8")


def find_adapter_html(output: Path, stem: str) -> Path:
    expected = output / f"{stem}.html"
    if expected.is_file():
        return expected
    candidates = sorted(output.rglob("*.html"))
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise RuntimeError("renderer adapter did not produce an HTML file")
    raise RuntimeError("renderer adapter produced more than one HTML file")


def run_renderer(
    project: Path,
    input_path: Path,
    output: Path,
    texinputs: str | None,
    tex4ht_options: str,
    build_command: str | None,
    adapter_command: str | None,
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

        adapter_output = disposable / "pairtex-adapter-output"
        adapter_output.mkdir()
        if adapter_command:
            command = [
                part.format(
                    project=str(disposable),
                    input=str(disposable_input),
                    output=str(adapter_output),
                )
                for part in shlex.split(adapter_command)
            ]
        else:
            command = ["make4ht", "-B", build_directory, disposable_input.name, tex4ht_options]
        result = subprocess.run(
            command,
            cwd=cwd,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        transcript = result.stdout + result.stderr
        errors = renderer_errors(transcript)
        try:
            html_path = (
                find_adapter_html(adapter_output, disposable_input.stem)
                if adapter_command
                else cwd / build_directory / f"{disposable_input.stem}.html"
            )
        except RuntimeError as error:
            html_path = adapter_output / f"{disposable_input.stem}.html"
            errors.append(str(error))
        if result.returncode != 0:
            errors.append(f"renderer exited with status {result.returncode}")
        if not html_path.is_file():
            errors.append(f"renderer did not produce {html_path.name}")

        if html_path.is_file():
            if not html_path.resolve().is_relative_to(disposable.resolve()):
                raise ValueError("Renderer HTML escapes disposable project")
            normalize_html_document(html_path)
            search_roots = []
            for raw_root in (texinputs or "").split(os.pathsep):
                if not raw_root:
                    continue
                root = Path(raw_root.removesuffix("//"))
                search_roots.append((cwd / root).resolve() if not root.is_absolute() else root.resolve())
            annotate_math_sources(disposable, disposable_input, html_path, search_roots)
            validate_rendered_html(html_path.read_text(encoding="utf-8"))
            parser = AssetParser()
            parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
            materialize_project_assets(disposable, html_path, parser.sources)
            materialize_pdf_assets(disposable, html_path, parser.sources)
            missing = missing_assets(html_path, parser.sources)
            errors.extend(f"missing HTML asset: {source}" for source in missing)

        if errors:
            raise RuntimeError("Renderer output rejected:\n" + "\n".join(f"- {error}" for error in errors))

        output.mkdir(parents=True, exist_ok=True)
        # Check every destination before publishing any files, including existing symlinks.
        for source in [html_path.name, *parser.sources]:
            asset_path(output, source)
        shutil.copy2(html_path, asset_path(output, html_path.name))
        for source in parser.sources:
            source_path = asset_path(html_path.parent, source)
            destination = asset_path(output, source)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a LaTeX project in a disposable copy")
    parser.add_argument("--version", action="version", version=f"PairTeX {__version__}")
    parser.add_argument("--project", type=Path, required=True, help="Target LaTeX project")
    parser.add_argument("--input", type=Path, required=True, help="Manuscript root relative to --project")
    parser.add_argument("--output", type=Path, required=True, help="Directory receiving accepted HTML output")
    parser.add_argument("--texinputs", help="Optional TEXINPUTS prefix required by the project renderer")
    parser.add_argument("--tex4ht-options", default="xhtml,mathml", help="TeX4ht style options (default: xhtml,mathml)")
    parser.add_argument(
        "--build-command",
        help="Optional project build command run before rendering; use {input} for the manuscript filename",
    )
    parser.add_argument(
        "--adapter-command",
        help=(
            "Optional external renderer adapter command. It receives {project}, {input}, and {output}; "
            "it must write one HTML file into {output}."
        ),
    )
    args = parser.parse_args()
    try:
        run_renderer(
            args.project,
            args.project / args.input,
            args.output,
            args.texinputs,
            args.tex4ht_options,
            args.build_command,
            args.adapter_command,
        )
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f"Accepted renderer output: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
