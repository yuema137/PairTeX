"""Structural validation of renderer-produced HTML and offline math fallbacks."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

RAW_TEX_MARKERS = re.compile(r"\\(?:\(|\)|\[|\]|begin\{|end\{)")
VOID_TAGS = set("area base br col embed hr img input link meta param source track wbr".split())
TOKENS = {"mi", "mn", "mo", "mtext", "ms"}
INERT = {"annotation", "annotation-xml", "mphantom", "script", "style"}
ARITY = {"mfrac": 2, "mroot": 2, "msub": 2, "msup": 2, "msubsup": 3,
         "munder": 2, "mover": 2, "munderover": 3}


@dataclass
class Node:
    tag: str
    attrs: dict[str, str | None] = field(default_factory=dict)
    children: list[Node] = field(default_factory=list)
    text: str = ""


def usable_math(node: Node) -> bool:
    """Require visible token content, not just the presence of a math tag."""
    if node.tag in INERT or node.tag in {"merror", "parsererror"}:
        return False
    if node.tag in TOKENS:
        return bool(node.text.strip())
    if node.text.strip():  # Native MathML does not render untokenized text.
        return False
    children = [child for child in node.children if child.tag not in {"annotation", "annotation-xml"}]
    if node.tag in ARITY and len(children) != ARITY[node.tag]:
        return False
    # Empty rows/spacers are legitimate (e.g. an empty base for a prescript).
    # They cannot by themselves establish that the whole formula is usable.
    def structurally_valid(child: Node) -> bool:
        if child.tag in INERT or child.tag == "mspace":
            return True
        if child.tag in {"merror", "parsererror"}:
            return False
        if child.tag in TOKENS:
            return True
        if child.text.strip():
            return False
        if child.tag in ARITY and len(child.children) != ARITY[child.tag]:
            return False
        return all(structurally_valid(item) for item in child.children)
    return all(structurally_valid(child) for child in children) and any(usable_math(child) for child in children)


def rendered(node: Node) -> bool:
    if node.tag in INERT:
        return False
    if node.tag == "math":
        return usable_math(node)
    if node.tag == "img":
        return bool(node.attrs.get("src"))
    if node.tag == "svg":
        return any(child.tag in {"path", "use", "text", "rect", "circle", "line", "polygon", "polyline"}
                   for child in descendants(node))
    return any(rendered(child) for child in node.children)


def descendants(node: Node):
    for child in node.children:
        yield child
        yield from descendants(child)


class _OutputParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]
        self.visible_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        self.stack[-1].text += data
        if not any(node.tag in INERT for node in self.stack):
            self.visible_text.append(data)


def validate_rendered_html(html: str) -> None:
    parser = _OutputParser()
    parser.feed(html)
    parser.close()
    errors: list[str] = []
    if RAW_TEX_MARKERS.search("".join(parser.visible_text)):
        errors.append("visible HTML contains raw TeX delimiters or environments")
    for node in descendants(parser.root):
        editable = node.attrs.get("data-editable")
        if editable in {"text", "math"} and not node.attrs.get("data-source-file"):
            errors.append("an editable unit is missing data-source-file")
        if editable == "math" and not rendered(node):
            errors.append("an editable math unit has no usable pre-rendered math element")
        if node.tag == "math" and not usable_math(node):
            errors.append("MathML has empty or structurally unusable content; emit tokenized MathML or an image/SVG fallback")
    if errors:
        raise ValueError("Renderer output validation failed: " + "; ".join(dict.fromkeys(errors)))
