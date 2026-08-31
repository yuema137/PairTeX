# PairTeX

Human-agent pair writing for LaTeX papers.

PairTeX is a human-facing review layer for existing LaTeX repositories. LaTeX remains the single source of truth; HTML is a disposable reading and feedback view, and PDF remains the submission and layout verification view.

PairTeX is deterministic and does not require an LLM, model API, or agent
runtime. Changes, comments, and
review actions in the HTML interface produce feedback output only. Users and
their coding agents decide independently whether and how to use that output to
modify `.tex` or `.bib` files.

This project is currently in the design and MVP exploration phase, with the Siderius paper as the initial pilot project.

## Demo 1

The current interaction demo uses an isolated LaTeX fixture and does not
depend on the Siderius paper repository:

```sh
python3 pairtex.py \\
  --project demo/fixture \\
  --html demo/fixture/rendered.html \\
  --port 8765
```

Open `http://127.0.0.1:8765/` to read the rendered manuscript, select text,
and create comments or change intents. Entries are written as independent
JSON files under `demo/fixture/.pairtex/feedback/`.

## Public ICLR Fixture

The repository also includes a larger public fixture based on the official
ICLR 2026 Master-Template. Its content is synthetic and is intended to test
renderer compatibility with formulas, citations, figures, tables, sections,
and subsections without depending on or exposing the SIDERIUS paper:

```sh
rm -rf /tmp/pairtex-iclr-rendered
python3 pairtex_render.py \\
  --project demo/iclr \\
  --input main.tex \\
  --output /tmp/pairtex-iclr-rendered \\
  --build-command 'latexmk -pdf -interaction=nonstopmode -halt-on-error {input}'

python3 pairtex.py \\
  --project demo/iclr \\
  --html /tmp/pairtex-iclr-rendered/main.html \\
  --port 8766
```

The template files are from the public ICLR Master-Template repository:
<https://github.com/ICLR/Master-Template/tree/master/iclr2026>.

The same synthetic manuscript is also available with the official NeurIPS
2026 and ICML 2025 wrappers under `demo/neurips/` and `demo/icml/`. These
fixtures intentionally share content and figures while varying the conference
style, source wrapper, and layout conventions so renderer compatibility can be
compared directly.

## Version boundary

PairTeX uses Git commits as the strongest version identity for human-agent collaboration. Feedback entries record the current `HEAD` commit and whether the working tree was dirty when the entry was created.

Clean commits are required for formal pilot evidence, but normal PairTeX use may start from a dirty working tree. Dirty feedback is marked as originating from an uncommitted state and relies more heavily on source and context anchors. PairTeX does not snapshot dirty worktrees, replay uncommitted patches, or merge source changes automatically.

## Commit-turn collaboration model

PairTeX treats one canonical TeX repository commit as one human-agent
collaboration turn:

```text
source commit
    -> one local HTML projection
    -> human feedback
    -> agent source edits
    -> next source commit
    -> rebuilt HTML projection
    -> feedback resolution
```

Different local users may generate different temporary HTML files from their
own checkout. These are independent projections, not synchronized manuscript
copies. PairTeX does not attempt to coordinate simultaneous browser sessions,
lock source files, merge feedback in real time, or resolve version conflicts.
Those concerns are intentionally outside the current collaboration model.

Future multi-user features must preserve commit-boundary turns as the primary
coordination primitive. Git remains responsible for exchanging committed source
and feedback artifacts; PairTeX remains responsible for presenting the local
projection and capturing human intent.

## Integration contract

The target project provides its manuscript configuration and existing build
workflow. PairTeX uses a replaceable renderer adapter to produce readable HTML
and validates the result before opening the interactive view.

The renderer output must show pre-rendered mathematics, preserve manuscript
semantics, and attach source-location context to interactive units. Raw LaTeX
source must not appear as the visible manuscript representation. Unsupported
content should be reported or kept read-only, not silently degraded.

PairTeX writes only feedback and disposable render/build output. It does not
apply feedback entries, edit source files, choose a coding agent, or define how
users and agents consume the entries.

## Appearance

The web view provides `System`, `Light`, and `Dark` color modes, plus the
`Ocean`, `Sage`, and `Nord` accent palettes. Appearance preferences are stored
only in the local browser and do not affect the manuscript, renderer output,
feedback entries, or source repository.

Palettes use a small replaceable schema with `label`, `light`, and `dark`
tokens. In addition to the surface tokens, `link`, `linkHover`, and
`linkVisited` may be supplied to keep document links readable in dark mode;
they fall back to `accent` when omitted. A local project may add `.pairtex/theme.js` defining
`window.PairTeXCustomPalettes` with the same shape:

```js
window.PairTeXCustomPalettes = {
  graphite: {
    label: "Graphite",
    light: { accent: "#4b5563", accentSoft: "rgba(75,85,99,.13)", ambient: "rgba(148,163,184,.18)", ambientSoft: "rgba(203,213,225,.20)" },
    dark: { accent: "#cbd5e1", accentSoft: "rgba(203,213,225,.16)", ambient: "rgba(71,85,105,.20)", ambientSoft: "rgba(51,65,85,.16)" }
  }
};
```

This optional file is loaded by the localhost server as a UI customization;
it is not interpreted as manuscript input and is never written by PairTeX.

## Renderer probe

The renderer adapter runs in a disposable copy of the target project. It never
writes renderer intermediates into the target working tree, and it rejects
output when the renderer reports errors, when the HTML file is missing, or when
an HTML asset referenced by the output is missing. For example:

```sh
python3 pairtex_render.py \
  --project /path/to/paper \
  --input arxiv/main.tex \
  --output /tmp/pairtex-rendered \
  --texinputs '../shared//:' \
  --build-command 'latexmk -pdf -interaction=nonstopmode -halt-on-error {input}'
```

The optional build command lets a project produce its normal bibliography and
cross-reference artifacts before HTML conversion. The target project's build
and renderer-specific path settings are supplied explicitly; PairTeX does not
edit the target project to make a renderer work.

## Renderer adapters

The default renderer is `make4ht`, but TeX-to-HTML conversion is replaceable.
Users can provide an external adapter command with `--adapter-command`; the
command receives disposable `{project}`, `{input}`, and `{output}` paths and
must write one HTML file into `{output}`. PairTeX retains common validation,
source annotation, asset collection, and output publication around that
adapter. See [`docs/renderer-adapters.md`](docs/renderer-adapters.md).

## Generic compatibility rule

Every compatibility fix must be evaluated as a PairTeX capability for arbitrary
LaTeX projects. PairTeX code must not add SIDERIUS-specific file names, paths,
macros, HTML selectors, or source assumptions. A fix that only helps one target
belongs in a disposable renderer configuration or in the compatibility notes,
not in the PairTeX runtime.

Feedback entries use an `open` / `resolved` lifecycle. Resolving keeps the
entry for history and records the source commit that addressed it; deleting
removes the entry artifact entirely. An optional generic coding-agent workflow
is provided in [`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md).
The active web interface shows open entries by default; resolved entries remain
in the repository but do not accumulate in the active review view.
The HTML interface cannot resolve or reopen entries. Resolution belongs to the
source-side user or coding agent after the canonical source has been changed,
built, committed, and the HTML projection refreshed.

## Feedback integration contract

Feedback files are independent JSON artifacts. The stable distinction is:

```text
status:   open | resolved       # lifecycle of source-side consumption
decision: pending | accepted    # change intent, when kind = change
kind:     comment | change
```

An Edit-mode change uses `decision: "accepted"`; a Review-mode proposal uses
`decision: "pending"`. Neither value means that the TeX source has already been
modified. Comments remain human feedback and do not imply a deterministic edit.

Each entry carries `head_commit`, `worktree_dirty`, and redundant anchor data:
file and line hints, section hierarchy, selected rendered/source text, and
surrounding context. Agents should reconcile these hints against the current
repository and leave ambiguous entries open.

Entries may also contain a `thread` array of follow-up messages. A source-side
agent that cannot resolve an item should append a reply explaining the issue or
asking a concrete question, rather than deleting or prematurely resolving the
entry. The complete data contract, examples, resolution boundary, and agent
ownership rules are documented in
[`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md).
