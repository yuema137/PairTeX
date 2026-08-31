---
name: pairtex-agent
description: Consume PairTeX feedback entries, update a canonical LaTeX repository, rebuild the manuscript, refresh the HTML projection, and resolve addressed feedback.
license: MIT
---

# PairTeX Agent Integration Protocol

PairTeX feedback is human intent stored in `.pairtex/feedback/*.json`. The
LaTeX repository remains canonical. This skill describes the data contract and
ownership boundaries for an optional repo-aware coding agent; PairTeX itself
does not execute this workflow or modify manuscript source.

## Collaboration turns

The protocol is turn-based. Treat one canonical TeX repository commit as one
human-agent collaboration turn:

```text
source commit -> local HTML projection -> human feedback
              -> source edits -> next source commit
              -> rebuilt HTML -> feedback resolution
```

Different users may have different temporary HTML projections in local
checkouts. PairTeX does not synchronize browser sessions, lock files, merge
uncommitted work, or resolve concurrent version conflicts. Git and the user's
normal repository workflow remain responsible for exchanging committed source
and feedback artifacts.

The commit boundary is the stable coordination primitive for future multi-user
extensions. A dirty worktree may still be viewed and may produce valid
feedback, but the feedback records its `head_commit` and `worktree_dirty` state
so the next source-side turn can reconcile it.

## Workflow

1. Read entries with `status: "open"` from `.pairtex/feedback/`. Treat old
   historical `status: "pending"` files conservatively; new entries must use
   `open` or `resolved` for lifecycle and `decision` for change intent.
2. Inspect each entry's `head_commit`, `worktree_dirty`, source file hint,
   section, selected text, source text, and surrounding context.
3. Compare the recorded revision with the current Git revision. Treat moved or
   unmatched context as potentially stale and reconcile it manually.
4. Decide whether the entry is a comment, an accepted Edit intent, or a
   pending Review proposal. `decision: "accepted"` never means that TeX has
   already changed.
5. Modify only canonical `.tex`, `.bib`, or other project source files needed
   to address the intent. Preserve the target repository's conventions and
   existing project structure.
6. Run the target project's existing build command and inspect the result.
7. Refresh the PairTeX HTML projection from the resulting source revision.
8. After the source change is committed, mark the addressed entry as
   `status: "resolved"` and record resolution metadata, including the commit
   that contains the source change. If the intent is not resolved, append a
   reply to its `thread` instead and leave it open.

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

## Data contract

Each file is an independent feedback artifact. Preserve fields that are not
being changed so that Git history and human context remain intact.

```text
.pairtex/feedback/<id>.json
```

The stable entry shape is:

```json
{
  "id": "uuid",
  "kind": "comment | change",
  "status": "open | resolved",
  "decision": "pending | accepted | null",
  "head_commit": "git commit visible when created",
  "worktree_dirty": false,
  "author": "optional display name",
  "anchor": {
    "file_hint": "sections/introduction.tex",
    "line_start_hint": 42,
    "line_end_hint": 42,
    "section": ["Introduction"],
    "selected_rendered_text": "Evaluation is often treated as an endpoint.",
    "selected_source_text": "Evaluation is often treated as an endpoint.",
    "rendered_offset": 18,
    "prefix_context": "The paper currently frames evaluation as: ",
    "suffix_context": " In practice, it is part of the research loop."
  },
  "payload": {},
  "thread": [],
  "created_at": "2026-08-30T20:56:35.745Z"
}
```

`head_commit` is the strongest version reference. `worktree_dirty` says that
the human was looking at an uncommitted working tree; it is valid input, not a
reason to reject the entry. File names, line numbers, section names, and
offsets are hints. Selected text and surrounding context are the primary
matching evidence.

### Comments

```json
{
  "kind": "comment",
  "status": "open",
  "decision": null,
  "payload": {
    "comment": "This paragraph repeats the framing in the abstract. Please reconsider the argument."
  },
  "thread": []
}
```

A comment is not automatically an edit instruction. The agent may change the
source, ask for clarification, or decide that no source change is needed. The
agent should explain that decision in the thread when the item remains open.

### Edit-mode changes

```json
{
  "kind": "change",
  "status": "open",
  "decision": "accepted",
  "payload": {
    "operation": "replace",
    "proposed_content": "Evaluation is part of the research loop, not merely its endpoint.",
    "instruction": "Preserve the surrounding terminology."
  },
  "thread": []
}
```

`accepted` means the human's Edit action does not require another accept/reject
step. It still produces only intent; the agent must apply it to canonical TeX
or explain why it cannot.

### Review-mode proposals

```json
{
  "kind": "change",
  "status": "open",
  "decision": "pending",
  "payload": {
    "operation": "replace",
    "proposed_content": "Evaluation is part of the research loop, not merely its endpoint.",
    "instruction": "Please check whether this claim is too strong."
  },
  "thread": []
}
```

The agent may accept, adapt, or decline a proposal after inspecting the current
manuscript. PairTeX does not apply that decision to TeX.

## Discussion threads

The original request remains in `payload`. Follow-up messages are appended to
the independent `thread` array:

```json
"thread": [
  {
    "id": "reply-uuid",
    "author": "paper-agent",
    "role": "agent",
    "body": "I found the paragraph, but this request conflicts with the definition in Section 3. I am leaving it open for clarification.",
    "created_at": "2026-08-30T22:10:00Z"
  }
]
```

Appending a reply must preserve all existing fields and earlier messages. A
thread is coordination history, not a second source of truth. `role` is
descriptive metadata, not authentication; common values are `human` and
`agent`.

If an agent cannot confidently locate or apply an item, it must leave
`status: "open"` and add a concise thread reply describing the ambiguity or
asking a concrete question. It must not resolve an item merely to clear it from
the active list.

## Resolution boundary

An agent may resolve a comment or change only after it has decided the intent is
addressed on the source side. The usual evidence is:

1. canonical `.tex`/`.bib` source was changed when appropriate;
2. the project's existing build command succeeds;
3. the PairTeX HTML projection was regenerated;
4. the result was inspected;
5. the source change was committed when the user's workflow calls for a commit.

Then preserve the original entry and add:

```json
{
  "status": "resolved",
  "resolution": {
    "resolved_at": "2026-08-30T22:20:00Z",
    "resolution_commit": "def456...",
    "note": "Reworked the paragraph, rebuilt the HTML projection, and verified the result."
  }
}
```

Resolution is not deletion. Resolved files remain in Git for history and are
hidden from the active PairTeX view. PairTeX's HTML interface cannot resolve or
reopen entries; that operation belongs to the source-side user or agent.

## Refresh boundary

PairTeX's `Refresh` action rereads the latest rendered HTML and feedback files.
It does not compile TeX, apply feedback, decide whether a proposal is correct,
or resolve an entry. The source-side workflow must regenerate the HTML before
refreshing the browser view.

## Agent safety rules

- Never modify canonical source merely to make PairTeX or a renderer work.
- Never assume HTML DOM selectors are durable source identity.
- Never treat a line hint as proof of a match.
- Never resolve stale or ambiguous feedback speculatively.
- Never delete a feedback file as a substitute for resolution.
- Never expose private manuscript content in public fixtures or repositories.
