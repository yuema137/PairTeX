# PairTeX

Human-agent pair writing for LaTeX papers.

PairTeX is a human-facing review layer for existing LaTeX repositories. LaTeX remains the single source of truth; HTML is a disposable reading and feedback view, and PDF remains the submission and layout verification view.

This project is currently in the design and MVP exploration phase, with the Siderius paper as the initial pilot project.

## Version boundary

PairTeX uses Git commits as the strongest version identity for human-agent collaboration. Feedback entries record the current `HEAD` commit and whether the working tree was dirty when the entry was created.

Clean commits are required for formal pilot evidence, but normal PairTeX use may start from a dirty working tree. Dirty feedback is marked as originating from an uncommitted state and relies more heavily on source and context anchors. PairTeX does not snapshot dirty worktrees, replay uncommitted patches, or merge source changes automatically.
