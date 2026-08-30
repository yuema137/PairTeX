# PairTeX

Human-agent pair writing for LaTeX papers.

PairTeX is a human-facing review layer for existing LaTeX repositories. LaTeX remains the single source of truth; HTML is a disposable reading and feedback view, and PDF remains the submission and layout verification view.

PairTeX never modifies canonical manuscript source. Changes, comments, and
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

## Version boundary

PairTeX uses Git commits as the strongest version identity for human-agent collaboration. Feedback entries record the current `HEAD` commit and whether the working tree was dirty when the entry was created.

Clean commits are required for formal pilot evidence, but normal PairTeX use may start from a dirty working tree. Dirty feedback is marked as originating from an uncommitted state and relies more heavily on source and context anchors. PairTeX does not snapshot dirty worktrees, replay uncommitted patches, or merge source changes automatically.

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

Feedback entries use an `open` / `resolved` lifecycle. Resolving keeps the
entry for history and records the source commit that addressed it; deleting
removes the entry artifact entirely. An optional generic coding-agent workflow
is provided in [`skills/pairtex-agent/SKILL.md`](skills/pairtex-agent/SKILL.md).
The active web interface shows open entries by default; resolved entries remain
in the repository but do not accumulate in the active review view.
