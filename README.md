# PairTeX

Human-agent pair writing for LaTeX papers.

PairTeX is a human-facing review layer for existing LaTeX repositories. LaTeX remains the single source of truth; HTML is a disposable reading and feedback view, and PDF remains the submission and layout verification view.

This project is currently in the design and MVP exploration phase, with the Siderius paper as the initial pilot project.

## Version boundary

PairTeX uses Git commits as the formal version boundary for human-agent collaboration. Feedback entries must identify the commit of the manuscript version they refer to.

Uncommitted working-tree changes are outside the MVP scope. Users should commit the manuscript before relying on PairTeX feedback as a shared, reproducible reference. PairTeX does not snapshot dirty worktrees, replay uncommitted patches, or merge source changes automatically.
