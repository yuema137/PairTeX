from __future__ import annotations

import tomllib
import unittest
from pathlib import Path

import pairtex
import pairtex_render


ROOT = Path(__file__).resolve().parents[1]


class VersionTest(unittest.TestCase):
    def test_runtime_version_matches_pyproject(self) -> None:
        """pyproject.toml is the single source of truth for the release version.

        `pairtex.py --version` reports pairtex.__version__, so bumping one
        without the other would ship a tool that misreports itself. Keeping the
        two in step is the whole reason this test exists.
        """
        pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        self.assertEqual(pairtex.__version__, pyproject["project"]["version"])

    def test_both_entry_points_report_the_same_version(self) -> None:
        self.assertEqual(pairtex_render.__version__, pairtex.__version__)
