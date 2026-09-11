from __future__ import annotations

import json
import shutil
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

import pairtex


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "demo" / "fixture"


class PairTeXLoopTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="pairtex-loop-"))
        self.project = self.temp_dir / "fixture"
        shutil.copytree(
            FIXTURE,
            self.project,
            ignore=shutil.ignore_patterns(".pairtex"),
        )
        self.source_path = self.project / "main.tex"
        self.html_path = self.project / "rendered.html"
        self.source_before = self.source_path.read_text(encoding="utf-8")

        app = pairtex.App(self.project, self.html_path)
        handler = type("PairTeXTestHandler", (pairtex.Handler,), {"app": app})
        self.server = pairtex.create_server("127.0.0.1", 0, handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.connection = HTTPConnection("127.0.0.1", self.server.server_port)

    def tearDown(self) -> None:
        self.connection.close()
        self.server.shutdown()
        self.server.server_close()
        shutil.rmtree(self.temp_dir)

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        self.connection.request(method, path, body=payload, headers=headers)
        response = self.connection.getresponse()
        raw = response.read()
        return response.status, json.loads(raw or b"{}")

    def test_human_feedback_agent_refresh_loop(self) -> None:
        status, initial = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(initial["entries"], [])
        self.assertEqual(self.source_path.read_text(encoding="utf-8"), self.source_before)

        anchor = {
            "file_hint": "main.tex",
            "line_start_hint": 9,
            "line_end_hint": 9,
            "section": ["Introduction"],
            "selected_rendered_text": "Evaluation is often treated as an endpoint.",
            "selected_source_text": "Evaluation is often treated as an endpoint.",
            "prefix_context": "",
            "suffix_context": " In practice,",
        }
        comment = {
            "kind": "comment",
            "status": "open",
            "head_commit": "uncommitted",
            "worktree_dirty": False,
            "anchor": anchor,
            "payload": {"comment": "Please make this opening sentence more direct."},
        }
        review = {
            "kind": "change",
            "status": "open",
            "decision": "pending",
            "head_commit": "uncommitted",
            "worktree_dirty": False,
            "anchor": anchor,
            "payload": {
                "operation": "replace",
                "proposed_content": "Evaluation begins the research loop.",
            },
        }

        status, saved_comment = self.request("POST", "/api/entries", comment)
        self.assertEqual(status, 201)
        status, saved_review = self.request("POST", "/api/entries", review)
        self.assertEqual(status, 201)

        status, state = self.request("GET", "/api/state?refresh=test")
        self.assertEqual(status, 200)
        self.assertEqual({entry["kind"] for entry in state["entries"]}, {"comment", "change"})
        self.assertNotIn("proposed_content", saved_comment["payload"])
        self.assertEqual(saved_review["payload"]["proposed_content"], "Evaluation begins the research loop.")
        self.assertEqual(self.source_path.read_text(encoding="utf-8"), self.source_before)

        status, _ = self.request(
            "PUT",
            f"/api/entries/{saved_comment['id']}",
            {**saved_comment, "status": "resolved"},
        )
        self.assertEqual(status, 400)

        # Simulate the source-side coding agent, outside PairTeX's API.
        source_after = self.source_before.replace(
            "Evaluation is often treated as an endpoint.",
            "Evaluation begins the research loop.",
        )
        self.source_path.write_text(source_after, encoding="utf-8")
        html_after = self.html_path.read_text(encoding="utf-8").replace(
            "Evaluation is often treated as an endpoint.",
            "Evaluation begins the research loop.",
        )
        self.html_path.write_text(html_after, encoding="utf-8")

        feedback_dir = self.project / ".pairtex" / "feedback"
        review_path = feedback_dir / f"{saved_review['id']}.json"
        review_data = json.loads(review_path.read_text(encoding="utf-8"))
        review_data["status"] = "resolved"
        review_data["resolved_in_commit"] = "source-side-test"
        review_path.write_text(json.dumps(review_data, indent=2) + "\n", encoding="utf-8")

        comment_path = feedback_dir / f"{saved_comment['id']}.json"
        comment_data = json.loads(comment_path.read_text(encoding="utf-8"))
        comment_data["thread"] = [{"role": "agent", "body": "Updated the opening sentence."}]
        comment_path.write_text(json.dumps(comment_data, indent=2) + "\n", encoding="utf-8")

        status, refreshed = self.request("GET", "/api/state?refresh=after-agent")
        self.assertEqual(status, 200)
        self.assertIn("Evaluation begins the research loop.", refreshed["manuscript_html"])
        refreshed_by_id = {entry["id"]: entry for entry in refreshed["entries"]}
        self.assertEqual(refreshed_by_id[saved_review["id"]]["status"], "resolved")
        self.assertEqual(refreshed_by_id[saved_comment["id"]]["thread"][0]["role"], "agent")

    def test_refresh_rejects_new_invalid_math(self) -> None:
        self.html_path.write_text('<math>x</math>', encoding="utf-8")
        status, result = self.request("GET", "/api/state?refresh=invalid")
        self.assertEqual(status, 422)
        self.assertIn("structurally unusable", result["error"])
        self.assertEqual(self.source_path.read_text(encoding="utf-8"), self.source_before)

    def test_complex_unverified_comment_stays_open_with_agent_reply(self) -> None:
        entry = {
            "kind": "comment",
            "status": "open",
            "head_commit": "uncommitted",
            "worktree_dirty": True,
            "anchor": {
                "file_hint": "main.tex",
                "line_start_hint": 9,
                "line_end_hint": 10,
                "section": ["Introduction"],
                "selected_rendered_text": "Evaluation is often treated as an endpoint.",
                "selected_source_text": "Evaluation is often treated as an endpoint.",
                "prefix_context": "This fixture demonstrates a small human--agent review loop. ",
                "suffix_context": " In practice, it is part of the research loop.",
                "source_hash": "fixture-source-hash",
                "base_commit": "uncommitted",
            },
            "payload": {
                "comment": (
                    "The introduction supposedly reports a 20% accuracy gain. "
                    "Please correct that claim, add the missing experiment, and "
                    "rewrite the paragraph so it matches the results section."
                ),
                "instruction": "Verify this against the canonical source before editing.",
            },
            "thread": [
                {
                    "id": "human-follow-up",
                    "author": "Yue Ma",
                    "role": "human",
                    "body": "I may be referring to a different draft; please do not guess.",
                }
            ],
        }
        status, saved = self.request("POST", "/api/entries", entry)
        self.assertEqual(status, 201)

        # The source-side agent cannot verify the claimed result in this paper.
        # It keeps the entry open and records the decision in the thread.
        path = self.project / ".pairtex" / "feedback" / f"{saved['id']}.json"
        agent_entry = json.loads(path.read_text(encoding="utf-8"))
        agent_entry["thread"].append(
            {
                "id": "agent-reply",
                "author": "coding-agent",
                "role": "agent",
                "body": (
                    "I could not verify the claimed 20% accuracy gain in the "
                    "current canonical source, so I left this comment open and "
                    "did not invent a correction or experiment."
                ),
            }
        )
        path.write_text(json.dumps(agent_entry, indent=2) + "\n", encoding="utf-8")

        status, refreshed = self.request("GET", "/api/state?refresh=complex")
        self.assertEqual(status, 200)
        refreshed_entry = refreshed["entries"][0]
        self.assertEqual(refreshed_entry["status"], "open")
        self.assertTrue(refreshed_entry["worktree_dirty"])
        self.assertEqual(refreshed_entry["anchor"]["source_hash"], "fixture-source-hash")
        self.assertEqual(refreshed_entry["thread"][-1]["role"], "agent")
        self.assertIn("left this comment open", refreshed_entry["thread"][-1]["body"])


if __name__ == "__main__":
    unittest.main()
