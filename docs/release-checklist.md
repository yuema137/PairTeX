# Release checklist

Run this before creating a tag.

The point is to find gaps while the tag does not yet exist. Once a tag is
published, moving it silently diverges for anyone who already cloned the
repository, because git does not update existing tags by default. If something
turns up after a release, ship a patch version rather than retagging.

## Checks

### 1. Nothing is missing from the tree

```sh
git status --short
```

Untracked files are the point of this check, not noise. Decide for each one
whether it belongs in the release, in `.gitignore`, or nowhere.

### 2. Tests pass on the exact commit being tagged

```sh
uv run python -m unittest discover -s tests -t .
```

### 3. CI is green on that commit

```sh
gh run list --branch main --workflow ci.yml --limit 1
```

Wait for `completed / success`. Do not tag a commit CI has not verified.

### 4. The version is the one you mean to publish

```sh
grep '^version' pyproject.toml
python3 pairtex.py --version
python3 pairtex_render.py --version
```

`tests/test_version.py` already fails on drift between these, so check 2 covers
consistency. What this step adds is a human confirming the number itself.

### 5. Licensing is consistent

```sh
ls LICENSE
grep -rn '^license:' skills/
```

Every license declared anywhere in the tree must agree with `LICENSE`.

### 6. Both READMEs describe current behavior

`README.md` and `README.zh-CN.md`. The commands, flags, and paths they show
should still be the ones the code accepts, and the two must not have drifted
apart.

## Tagging

```sh
git tag -a <version> -m "PairTeX <version>"
git push origin <version>
gh release create <version> --title "<version>" --verify-tag --notes-file <notes>
```

## If a gap appears after publishing

Ship a patch version. Do not delete and recreate a published tag.
