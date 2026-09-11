# Renderer Adapter Contract

PairTeX keeps TeX-to-HTML conversion behind a replaceable renderer adapter.
The built-in default uses `make4ht` with MathML output. A user may provide an
external adapter command when a project needs a different renderer or a
project-specific compatibility step.

Invoke the adapter with:

```sh
python3 pairtex_render.py \\
  --project /path/to/paper \\
  --input main.tex \\
  --output /tmp/pairtex-rendered \\
  --adapter-command '/path/to/render-adapter {project} {input} {output}'
```

PairTeX replaces these placeholders before starting the command:

* `{project}` — absolute path to PairTeX's disposable project copy;
* `{input}` — absolute path to the manuscript entry file in that copy;
* `{output}` — absolute path to an empty disposable adapter-output directory.

The adapter must write exactly one `.html` file into `{output}`. Relative `src` and `href` dependencies in that HTML (including linked TXT, PDF,
and ZIP attachments and stylesheets) are collected and copied with the accepted
output, preserving subdirectories. URL escapes are decoded; queries and fragments
are excluded from file lookup. External URLs and in-page anchors are ignored.
Missing local files reject the render. Absolute local paths, parent traversal,
and symlinks escaping the output/project boundary are rejected. Only declared
dependencies are published; do not rely on unlinked files being copied.
CSS `url()` dependencies and links inside secondary HTML files are not crawled;
declare required files in the entry HTML or inline them.
PairTeX then performs the common safety and compatibility checks:

* renderer/build failures reject the output;
* missing local assets reject the output;
* rendered formulas are source-annotated when the generic mapping is valid;
* output is copied only after validation;
* the original project is never used as the renderer working directory.

The adapter owns only TeX/project rendering. It does not own feedback entries,
Git lifecycle, review UI, source editing, or feedback resolution. An adapter
may use the project's existing build artifacts, but it must not modify the
user's original working tree.

## Formula provenance and offline rendering

Adapters can supply `data-editable="math"`, `data-source-file`,
`data-source-line`, and `data-math-source` on formula wrappers. If the adapter
supplies math annotations, it owns the mapping for the document; PairTeX
preserves those anchors instead of applying its positional mapper.

For unannotated output, the generic mapper handles simple source formulas and
standalone nested inputs. It preserves actual source line numbers. Conditional
TeX, macro definitions, and BibTeX/BibLaTeX commands cannot be reliably evaluated
by this scanner. Those documents, and documents whose formula counts differ,
retain their rendered formulas with `data-source-mapping="unmapped"`. Formula
direct editing is disabled and a visible notice explains how to provide explicit
anchors. Formulas remain selectable for comments. This conservative fallback
applies to the whole document, even if some formulas could individually be mapped.

Math fallbacks must work without MathJax: emit tokenized native MathML (for example
`<math><mi>x</mi></math>`), or a nonempty SVG/image fallback. Empty MathML and raw
text under structural elements such as `math`, `mrow`, and `mfrac` fail validation
before publication. This is structural validation, not a guarantee that arbitrary
renderer CSS, fonts, images, or every browser will display correctly. The UI
reports when the converter is unavailable/loading and retains original rendering
when MathJax does not recognize a custom macro.

## Regression checks

Run `python3 -m unittest discover -s tests -t . -v` for server, provenance,
validation, and publication tests. Browser tests require an external Playwright
installation and a browser, with `NODE_PATH` pointing to its `node_modules`:

```sh
node tests/browser-regressions.cjs
node tests/browser-interactions.cjs
```

Set `PAIRTEX_BROWSER_CHANNEL=chrome` to use installed Chrome. The regression suite
intercepts MathJax loading to test success, delay, and failure deterministically;
the interaction suite also exercises the real CDN converter.
