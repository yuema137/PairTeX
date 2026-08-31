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

The adapter must write exactly one `.html` file into `{output}`. Relative asset
references in that HTML are collected and copied with the accepted output.
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
