# PairTeX Design Notes

## Product boundary

PairTeX is a local human-facing review layer for existing LaTeX repositories.
It renders the manuscript as readable, interactive HTML and records structured
human feedback. It does not modify the LaTeX repository.

LaTeX remains the single source of truth. HTML is a disposable projection for
reading and feedback. PDF remains the layout and submission verification view.

## MVP workflow

```text
existing LaTeX repository
    -> PairTeX CLI
    -> localhost web app
    -> readable HTML manuscript
    -> comments and change proposals
    -> versioned feedback entries
```

The MVP targets a single local repository first. Multiple people can use the
same workflow through Git: each person runs PairTeX locally and synchronizes
the repository, including feedback entries, with normal Git operations.

## Version boundary

Git commits define the formal manuscript versions used by PairTeX. Every
feedback entry must identify the commit it refers to.

Uncommitted working-tree changes are outside the MVP scope. PairTeX does not
snapshot dirty worktrees, replay uncommitted patches, or merge source changes.

## Core responsibilities

PairTeX is responsible for:

- locating or loading project configuration;
- invoking an existing project build or render workflow;
- presenting a simple, readable HTML projection;
- supporting Edit and Review interactions;
- collecting comments and change proposals;
- persisting entries with version and source-location context;
- showing whether an entry may be stale.

PairTeX is not responsible for:

- editing or rewriting `.tex` or `.bib` files;
- applying feedback entries to source files;
- choosing or orchestrating a coding agent;
- providing accounts, authentication, or real-time collaboration;
- implementing a new TeX compiler or a general-purpose merge engine.

## Proposed boundaries

The implementation should keep replaceable concerns behind small boundaries:

- `ProjectAdapter`: manuscript root, project configuration, build command,
  repository identity, and current commit;
- `RendererAdapter`: LaTeX-to-HTML conversion and source-location metadata;
- `FeedbackStore`: read and write versioned entries;
- `WebApp`: manuscript presentation and human interaction.

The first implementation should use local files and the existing project
tooling. These boundaries are extension points, not invitations to build a
framework before the pilot demonstrates a need.

## Entry location model

The commit identifies the manuscript version. It does not identify a location
within that version. A feedback entry should therefore retain both version and
location context.

The minimal proposed target information is:

```text
version.commit
target.file
target.section
target.source_text
target.prefix_context
target.suffix_context
target.line_start_hint
target.line_end_hint
rendered.text
rendered.block_id
```

Source text and surrounding context are the primary location evidence. File,
section, and line numbers help agents locate the target but are not identity.
Rendered DOM selectors are interaction details and must not become the durable
identity of an entry.

## Renderer direction

The default renderer should optimize for:

- faithful correspondence between visible manuscript content and LaTeX source;
- simple semantic HTML;
- comfortable single-column reading;
- clear equations, references, figures, and section hierarchy;
- source-location metadata usable by feedback entries.

It does not need to reproduce PDF layout. The default visual language should
be restrained, readable, responsive, and easy to theme through a small set of
design tokens.

## Open decisions after pilot inspection

- the exact Siderius build and renderer command;
- the first supported TeX-to-HTML tool;
- the on-disk entry layout, such as one file per entry or append-only JSONL;
- the minimum source mapping metadata available from the selected renderer;
- the precise Edit-mode behavior.

These decisions should be made against the Siderius repository rather than an
abstract arbitrary-LaTeX test case.
