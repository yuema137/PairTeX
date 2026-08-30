---
name: pairtex-agent
description: Consume PairTeX feedback entries, update a canonical LaTeX repository, rebuild the manuscript, refresh the HTML projection, and resolve addressed feedback.
license: MIT
---

# PairTeX Agent Workflow

PairTeX feedback is human intent stored in `.pairtex/feedback/*.json`. The
LaTeX repository remains canonical. This skill describes an optional workflow
for a repo-aware coding agent; PairTeX itself does not execute it.

## Workflow

1. Read entries with `status: "open"` from `.pairtex/feedback/`.
2. Inspect each entry's `head_commit`, `worktree_dirty`, source file hint,
   section, selected text, source text, and surrounding context.
3. Compare the recorded revision with the current Git revision. Treat moved or
   unmatched context as potentially stale and reconcile it manually.
4. Decide whether the entry is a comment, an accepted Edit intent, or a
   pending Review proposal.
5. Modify only canonical `.tex`, `.bib`, or other project source files needed
   to address the intent. Preserve the target repository's conventions and
   existing project structure.
6. Run the target project's existing build command and inspect the result.
7. Refresh the PairTeX HTML projection from the resulting source revision.
8. After the source change is committed, mark the addressed entry as
   `status: "resolved"` and record resolution metadata, including the commit
   that contains the source change.

## Lifecycle rules

- `status: "open"` means the feedback remains active.
- `status: "resolved"` means it has been addressed and remains stored.
- Deleting an entry is not resolution. Delete only when the user explicitly
  asks to remove the feedback artifact.
- A change's `decision` is separate from lifecycle. `accepted` or `pending`
  does not by itself mean that the source has been updated.
- If the agent cannot confidently locate or address an entry, leave it open
  and explain the problem rather than resolving it speculatively.

## Resolution metadata

When resolving an entry, preserve its original fields and add metadata such as:

```json
{
  "status": "resolved",
  "resolution": {
    "resolved_at": "2026-08-30T00:00:00Z",
    "resolution_commit": "def456",
    "note": "Updated the evaluation paragraph and rebuilt the HTML."
  }
}
```

The agent owns source edits and build debugging. PairTeX owns feedback capture,
storage, and presentation only.
