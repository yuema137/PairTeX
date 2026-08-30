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

The MVP will be validated against the Siderius paper, but PairTeX must remain
fully independent of that project. Siderius is an external pilot fixture, not
a runtime dependency, source dependency, bundled asset, or special-case
integration. Multiple people can use the same workflow through Git: each
person runs PairTeX locally and synchronizes the target repository, including
feedback entries, with normal Git operations.

## Version boundary

Git commits define the strongest formal manuscript version identity used by
PairTeX. Every feedback entry records the current `HEAD` commit and whether
the working tree was dirty when the entry was created.

Clean commits are required for formal Siderius pilot evidence, but normal
PairTeX use may start from a dirty working tree. Dirty feedback is explicitly
marked as originating from an uncommitted state and relies more heavily on
source text and surrounding context. PairTeX does not snapshot dirty
worktrees, replay uncommitted patches, or merge source changes.

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

PairTeX must never write to canonical manuscript source. HTML edits, comments,
review decisions, renderer metadata, and rebuild requests may only produce or
update PairTeX output artifacts, such as files under `.pairtex/feedback/` and
disposable render/build directories. Whether a user or coding agent later
uses those outputs to modify `.tex` or `.bib` files is outside PairTeX's
responsibility.

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

PairTeX must not hard-code Siderius paths, manuscript names, shared assets,
build assumptions, or repository conventions. Project-specific behavior belongs
in user-provided configuration or a generic adapter contract.

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

### Renderer output contract

An adapter may use any suitable LaTeX-to-HTML tool, but PairTeX only opens the
interactive manuscript view after the adapter output passes validation. The
output must:

- visibly pre-render mathematics as MathML, SVG, or another rendered form;
- keep raw TeX source in metadata, not as visible manuscript content;
- preserve section, paragraph, citation, reference, figure, and table meaning;
- attach source file and context hints to interactive semantic units;
- mark editable units explicitly as prose text or source-aware mathematics;
- mark unsupported or protected structures as read-only while leaving them
  commentable where possible.

The validator should fail clearly when the output contains unrendered math,
missing source hints, or a renderer failure. PairTeX must not silently fall
back to displaying raw LaTeX as the manuscript view.

### User and agent integration contract

The user or the user's coding agent is responsible for providing a project
configuration, ensuring the selected renderer and existing build workflow are
available, and deciding how to consume feedback entries. They may inspect,
apply, reject, transform, or archive entries using their own workflow.

PairTeX does not prescribe an agent framework, an entry-consumption protocol,
source patching strategy, or an automatic path from HTML interaction to
canonical source modification.

An optional generic agent workflow is documented in `skills/pairtex-agent/`.

## Demo acceptance criteria

### Demo 1: minimal interaction fixture

Demo 1 proves PairTeX's own interaction and data model with a small,
independent LaTeX fixture. It passes when a user can:

1. render a small manuscript as readable HTML;
2. select rendered text;
3. create a comment or a change proposal;
4. persist a structured entry;
5. reload the local web app and see the entry again;
6. inspect the entry's commit and source-location hints.

Demo 1 does not prove arbitrary LaTeX compatibility. It does not require a
general source-rewriting engine or sophisticated source mapping.

### Demo 2: Siderius pilot

Demo 2 uses a clean, explicit Siderius commit in a disposable checkout. It
passes when the same PairTeX workflow can handle the active arXiv manuscript's
multi-file source, mathematics, figures, citations, bibliography, and existing
build workflow without importing Siderius-specific logic into PairTeX.

## Renderer adapter comparison

The renderer is an adapter. PairTeX owns the adapter contract and the HTML
interaction layer; it does not own a TeX parser.

| Option | Strengths for this project | Risks or costs | Design position |
|---|---|---|---|
| LaTeXML | Produces an intermediate document model and HTML/MathML outputs; its extension model can represent package-specific behavior. | Separate parser/runtime and package bindings add installation and compatibility work. | Strong candidate when semantic output and extensibility outweigh setup cost. |
| TeX4ht via `make4ht` | Runs LaTeX itself, supports HTML5/XML-oriented output, MathML or MathJax, and configurable build files. | Output depends on TeX4ht configuration and the local TeX installation; source metadata and package compatibility need testing. | Practical lightweight candidate, but never a PairTeX architectural dependency. |
| lwarp | Uses LaTeX processing to generate HTML and can interpret document meaning through LaTeX-side support. | Requires adding and configuring a package in the target document; compatibility with arbitrary templates and packages must be established. | Candidate for projects willing to opt into lwarp-specific source configuration, not assumed universal. |

The first adapter should be selected by a small compatibility matrix covering
the Siderius paper and the independent fixture. The decision must consider
semantic readability, math, citations, figures, complex templates,
source-location hints, installation burden, and local/incremental serving. It
must not be based only on which command happens to be installed locally.

The initial read-only probes found that this machine's `htlatex` invocation
reached Siderius mathematics but failed in an `align` environment, while
`make4ht` was present but missing a local `luaxml-domobject` runtime component.
These are renderer/environment compatibility findings, not reasons to add
renderer-specific logic to PairTeX.

## Minimal feedback model

The on-disk representation should favor Git-friendly independent entries. Each
feedback entry is one JSON file under `.pairtex/feedback/`, for example
`.pairtex/feedback/01K....json`. Parallel contributors can add feedback
without appending to the same file, and lifecycle changes remain isolated to
one artifact.

The minimum conceptual record is:

```json
{
  "id": "entry-id",
  "kind": "comment",
  "status": "open",
  "decision": null,
  "head_commit": "abc123",
  "worktree_dirty": false,
  "author": "Yue",
  "anchor": {
    "file_hint": "main.tex",
    "line_start_hint": 12,
    "line_end_hint": 12,
    "section": ["Introduction"],
    "selected_rendered_text": "Evaluation is often treated as an endpoint.",
    "selected_source_text": "Evaluation is often treated as an endpoint.",
    "prefix_context": "...",
    "suffix_context": "..."
  },
  "payload": {
    "comment": "This repeats the framing above."
  },
  "created_at": "2026-08-30T00:00:00Z"
}
```

`head_commit` identifies the current Git revision, while `worktree_dirty`
states whether uncommitted changes were present. File, section, quoted text,
surrounding context, and line hints identify the target within the observed
content. Line numbers are hints, not identity. PairTeX may report an entry as
potentially stale, but does not decide how a user or agent should reconcile it.

`status` is the feedback lifecycle and is either `open` or `resolved`.
Resolving keeps the JSON file and may record resolution metadata. Deleting an
entry removes the JSON file entirely. These are different operations.

For change entries, `decision` records the interaction semantics separately
from lifecycle: it may be `accepted` for Edit mode or `pending` for Review
mode. A change can therefore be accepted as an intent while remaining open
until a user or coding agent addresses it in canonical source.

`author` is optional display metadata. It may come from a configured display
name or `git config user.name`; PairTeX does not require GitHub identity,
authentication, or an account system.

For a change proposal, `payload` contains an operation such as `insert`,
`delete`, or `replace`, plus proposed content. PairTeX records the intent; it
does not apply the change to `.tex` or `.bib` files.

When a coding agent addresses an entry, it should rebuild the manuscript and
refresh the HTML from the resulting source revision before marking the entry
resolved. Resolution metadata should identify the commit containing the source
change. PairTeX does not require or implement this consumer workflow itself.

## Edit and Review semantics

In Edit mode, the UI presents a human change as authoritative. The change is
accepted immediately and a source modification is requested immediately. The
MVP may persist the accepted change as a structured change entry, while a
coding agent or human developer performs the actual modification to the
canonical LaTeX source.

In Review mode, the UI presents the same kinds of operations as pending
proposals that can be accepted, rejected, or left open. Comments can exist in
either mode and can target selected text or a document location/block.

Edit and Review share the same underlying change representation. Their
difference is lifecycle: Edit is immediately accepted and requested against
canonical source, while Review requires a later accept or reject decision.
PairTeX still does not implement a source-editing engine.

## Editable content boundary

Edit mode must not make the entire rendered DOM editable. The renderer marks
which semantic units have a safe source correspondence, and PairTeX only
enables editing for those units.

- Prose text can be edited directly inside an editable text block.
- Mathematics can be edited through a source-aware LaTeX math input with a
  live rendered preview when the renderer exposes the math source.
- Figures, tables, citations, cross-references, footnotes, section structure,
  metadata, environment boundaries, custom macros, and layout wrappers remain
  read-only. They can still receive comments or Review proposals.

The HTML contract is intentionally small:

```html
<p data-editable="text" data-source-file="sections/intro.tex">...</p>
<div data-editable="math" data-math-source="...">...</div>
<table data-editable="false">...</table>
```

This boundary prevents a browser edit from silently changing renderer markup
or document structure that the consuming agent cannot map back to canonical
LaTeX.

## Runtime ownership

PairTeX should own only:

- project and configuration discovery;
- a renderer adapter;
- a localhost reading and review UI;
- feedback persistence and lifecycle display;
- rebuild and refresh hooks.

The user's coding agent or developer owns:

- locating source robustly when context has moved;
- editing `.tex` and `.bib` files;
- maintaining multi-file consistency;
- resolving stale feedback;
- compiling and debugging manuscript source.

## Technical risks

The two risks that can threaten the minimal design are:

1. renderer compatibility with real papers, especially complex templates,
   mathematics, figures, citations, and bibliography;
2. insufficient source-location hints in the generated HTML.

The second risk is bounded by retaining redundant human-readable context and
letting the consuming agent perform fuzzy location. PairTeX does not need
deterministic HTML-to-TeX rewriting.

## Explicit non-goals

The MVP will not include an editor plugin, central service, account database,
OAuth authentication, GitHub identity integration, real-time collaboration,
CRDTs, automatic source patching, a custom TeX parser, a general merge engine,
or an agent execution framework.

## Design status

**DESIGN READY FOR FREEZE — DO NOT IMPLEMENT**

Implementation approval requires freezing this document after review of the
renderer comparison and the Demo 1 / Demo 2 acceptance criteria.
