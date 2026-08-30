# PairTeX

Human-agent pair writing for LaTeX papers.

PairTeX is a human-facing review layer for existing LaTeX repositories. LaTeX remains the single source of truth; HTML is a disposable reading and feedback view, and PDF remains the submission and layout verification view.

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
