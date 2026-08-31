# PairTeX

Human-agent pair writing for existing LaTeX papers.

PairTeX renders an existing LaTeX repository as a readable, interactive local
HTML view. Humans can edit supported prose/math, propose changes, and leave
comments. PairTeX stores those actions as feedback artifacts; it never edits
`.tex`, `.bib`, figures, or other canonical source files. LaTeX remains the
single source of truth, while HTML is disposable.

PairTeX is deterministic and does not require an LLM, model API, or agent
runtime.

## Quick start

Point PairTeX at an existing project and an already rendered HTML file:

```sh
python3 pairtex.py \
  --project /path/to/paper \
  --html /tmp/pairtex-rendered/main.html \
  --port 8765
```

Open <http://127.0.0.1:8765/>. PairTeX writes feedback to independent files
under `/path/to/paper/.pairtex/feedback/` and does not modify the manuscript.

Each user may run PairTeX with their own temporary HTML projection. PairTeX
does not synchronize those projections.

## Public demos

### Minimal interaction demo

```sh
python3 pairtex.py \
  --project demo/fixture \
  --html demo/fixture/rendered.html \
  --port 8765
```

This isolated fixture demonstrates comments, Edit/Review modes, formula
editing, feedback persistence, threads, and section navigation. It does not
depend on the private SIDERIUS paper.

### Conference-template demos

The repository includes the same synthetic paper in public ICLR, NeurIPS, and
ICML wrappers:

```sh
python3 pairtex_render.py \
  --project demo/iclr \
  --input main.tex \
  --output /tmp/pairtex-iclr-rendered \
  --build-command 'latexmk -pdf -interaction=nonstopmode -halt-on-error {input}'

python3 pairtex.py \
  --project demo/iclr \
  --html /tmp/pairtex-iclr-rendered/main.html \
  --port 8766
```

The equivalent projects are `demo/neurips/` and `demo/icml/`. They test
formulas, citations, figures, tables, sections, subsections, and different
conference styles without using SIDERIUS content.

## Human-agent workflow

```text
render current source
    -> human adds feedback in HTML
    -> coding agent reads .pairtex/feedback/
    -> agent edits canonical source
    -> agent rebuilds source and HTML
    -> agent resolves addressed entries or replies in their thread
    -> human clicks Refresh
```

One canonical source commit is one collaboration turn. Git handles committed
source and feedback artifacts; PairTeX does not handle concurrent editing,
locking, merging, or version-conflict resolution.

For coding-agent integration, use the optional protocol in
[`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md). It explains the
feedback schema, anchors, Comment/Edit/Review semantics, discussion threads,
resolution rules, and copy-paste prompts.

## Renderer adapters

The default renderer is `make4ht`, but rendering is replaceable. Use
`--adapter-command` to provide an external adapter; see
[`docs/renderer-adapters.md`](docs/renderer-adapters.md).

The adapter runs against a disposable project copy. PairTeX validates and
publishes the HTML projection but never changes the target source to make a
renderer work.

## Project boundary

PairTeX is a clean drop-in layer, not an IDE or Overleaf replacement. It does
not provide a compiler, source editor, bibliography manager, agent framework,
LLM integration, CRDT collaboration, or HTML-to-LaTeX rewriting system.
