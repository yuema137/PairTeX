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

One canonical TeX source commit is one collaboration turn. The complete loop is:

### 1. Ask the agent to start PairTeX

Send this prompt from the LaTeX repository:

```text
Read and follow skills/pairtex-agent/SKILL.md. Use PairTeX to render this existing LaTeX repository into a disposable local HTML projection. Discover the manuscript entry point and use the repository's existing build workflow. Do not modify any canonical source files. Start the PairTeX localhost view and report the URL, source HEAD commit, dirty state, render command, and HTML output path.
```

If the agent does not already have this skill available, provide it from this
repository or install it in that agent's skill directory before sending the
prompt.

The agent should only build/render and start the local view. Open the reported
URL and use the HTML interface to add comments, Edit-mode changes, or
Review-mode proposals. PairTeX writes them to `.pairtex/feedback/`.

### 2. Ask the agent to consume the feedback

After finishing your feedback, send:

```text
Read and follow skills/pairtex-agent/SKILL.md. Consume the open PairTeX feedback in .pairtex/feedback/. For each entry, use its commit and redundant source anchors to inspect the current repository, apply appropriate changes only to canonical source, and preserve existing project conventions. Build the paper and regenerate the PairTeX HTML projection. Resolve only feedback that is actually addressed; for anything ambiguous or intentionally deferred, leave it open and append a concise thread reply. Report the source diff, build result, render path, and feedback decisions.
```

The agent may modify only the canonical source as part of this step. It should
not resolve feedback speculatively. A comment can result in a source edit, a
question in the thread, or an explained decision not to edit. An Edit-mode
change is already accepted as human intent; a Review-mode change remains a
proposal until the agent decides how to handle it.

### 3. Refresh the browser

When the agent reports that it has regenerated the HTML, click `Refresh` in the
PairTeX page. The page rereads the latest HTML and feedback files. It does not
compile TeX or modify source.

The agent should commit the canonical source change at the end of the turn,
then record that source commit in the resolution metadata. Feedback metadata
may be committed separately for Git exchange. If an item is not addressed, it
stays open and receives a thread reply.

For the full schema, anchor rules, lifecycle semantics, thread format, and
agent boundaries, read
[`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md).

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
