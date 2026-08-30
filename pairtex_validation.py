"""Small validation gate for renderer-produced HTML."""

from __future__ import annotations

import re
from html.parser import HTMLParser


RAW_TEX_MARKERS = re.compile(r"\\(?:\(|\)|\[|\]|begin\{|end\{)")


class _OutputParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.visible_text: list[str] = []
        self.math_units: list[dict[str, bool]] = []
        self._math_stack: list[dict[str, bool]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("data-editable") in {"text", "math"} and not attributes.get("data-source-file"):
            self.math_units.append({"invalid_source": True})
        if attributes.get("data-editable") == "math":
            self._math_stack.append({"invalid_source": not bool(attributes.get("data-source-file")), "rendered": False})
        if self._math_stack and tag in {"math", "svg", "img"}:
            self._math_stack[-1]["rendered"] = True

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag in {"math", "svg", "img"} and self._math_stack:
            self._math_stack[-1]["rendered"] = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self._math_stack:
            self.math_units.append(self._math_stack.pop())

    def handle_data(self, data: str) -> None:
        self.visible_text.append(data)


def validate_rendered_html(html: str) -> None:
    parser = _OutputParser()
    parser.feed(html)
    errors: list[str] = []
    if RAW_TEX_MARKERS.search("".join(parser.visible_text)):
        errors.append("visible HTML contains raw TeX delimiters or environments")
    for unit in parser.math_units:
        if unit.get("invalid_source"):
            errors.append("an editable unit is missing data-source-file")
        if "rendered" in unit and not unit["rendered"]:
            errors.append("an editable math unit has no pre-rendered math element")
    if errors:
        raise ValueError("Renderer output validation failed: " + "; ".join(dict.fromkeys(errors)))
