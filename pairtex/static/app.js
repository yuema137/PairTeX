const state = {
  mode: "edit",
  kind: null,
  selection: null,
  project: null,
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function selectedAnchor() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null;
  const node = selection.anchorNode?.parentElement?.closest("[data-source-file]");
  if (!node) return null;
  const text = selection.toString().trim();
  const blockText = node.textContent.trim();
  const index = blockText.indexOf(text);
  return {
    file_hint: node.dataset.sourceFile,
    line_start_hint: Number(node.dataset.sourceLine || 0) || null,
    line_end_hint: Number(node.dataset.sourceLineEnd || node.dataset.sourceLine || 0) || null,
    section: (node.dataset.section || "").split("/").filter(Boolean),
    selected_rendered_text: text,
    selected_source_text: node.dataset.sourceText || text,
    prefix_context: index > 0 ? blockText.slice(Math.max(0, index - 80), index) : "",
    suffix_context: index >= 0 ? blockText.slice(index + text.length, index + text.length + 80) : "",
  };
}

function showTools() {
  const anchor = selectedAnchor();
  const selection = window.getSelection();
  if (!anchor || !selection?.rangeCount) {
    $("#selection-tools").hidden = true;
    return;
  }
  state.selection = anchor;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const tools = $("#selection-tools");
  tools.style.left = `${Math.max(12, rect.left + rect.width / 2 - 80)}px`;
  tools.style.top = `${Math.max(70, rect.top - 46)}px`;
  tools.hidden = false;
}

function renderEntries(entries) {
  $("#entry-count").textContent = entries.length;
  $("#entries").innerHTML = entries.length ? entries.map((entry) => {
    const payload = entry.payload || {};
    const body = payload.comment || payload.proposed_content || "Change intent";
    const kind = entry.kind === "change" ? `change · ${entry.status}` : "comment";
    return `<article class="entry">
      <div class="entry__top"><span>${escapeHtml(kind)}</span><span>${escapeHtml(entry.author || "anonymous")}</span></div>
      <p class="entry__quote">“${escapeHtml(entry.anchor?.selected_rendered_text || "Document location") }”</p>
      <p class="entry__body">${escapeHtml(body)}</p>
      <div class="entry__meta">${escapeHtml(entry.anchor?.file_hint || "unknown source")} · ${escapeHtml(entry.head_commit || "no commit")}${entry.worktree_dirty ? " · dirty" : ""}</div>
    </article>`;
  }).join("") : `<p class="help">No feedback entries yet.</p>`;
}

function openEntryDialog(kind) {
  if (!state.selection) return;
  state.kind = kind;
  $("#dialog-kind").textContent = kind === "change" ? "Change proposal" : "Comment";
  $("#dialog-title").textContent = state.mode === "edit" && kind === "change" ? "Edit manuscript" : "Add feedback";
  $("#message-label").textContent = kind === "change" ? "Instruction" : "Comment";
  $("#dialog-quote").textContent = `“${state.selection.selected_rendered_text}”`;
  $("#change-label").hidden = kind !== "change";
  $("#message").value = "";
  $("#proposed-text").value = "";
  $("#entry-dialog").showModal();
}

async function saveEntry(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save") {
    $("#entry-dialog").close();
    return;
  }
  const kind = state.kind;
  const entry = {
    id: crypto.randomUUID(),
    kind,
    status: kind === "change" && state.mode === "edit" ? "accepted" : kind === "change" ? "pending" : "open",
    head_commit: state.project.head_commit,
    worktree_dirty: state.project.worktree_dirty,
    author: state.project.author || undefined,
    anchor: state.selection,
    payload: kind === "change" ? {
      operation: "replace",
      instruction: $("#message").value.trim(),
      proposed_content: $("#proposed-text").value.trim(),
    } : { comment: $("#message").value.trim() },
    created_at: new Date().toISOString(),
  };
  const response = await fetch("/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  if (!response.ok) {
    alert("Could not save the entry.");
    return;
  }
  state.project.entries.push(await response.json());
  renderEntries(state.project.entries);
  $("#entry-dialog").close();
  $("#selection-tools").hidden = true;
  window.getSelection()?.removeAllRanges();
}

async function init() {
  state.project = await (await fetch("/api/state")).json();
  $("#paper").innerHTML = state.project.manuscript_html;
  $("#version-status").textContent = `${state.project.head_commit.slice(0, 12)}${state.project.worktree_dirty ? " · dirty" : ""}`;
  renderEntries(state.project.entries);
  document.addEventListener("selectionchange", showTools);
  $("#selection-tools").addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action) openEntryDialog(action === "change" ? "change" : "comment");
  });
  $("#entry-form").addEventListener("submit", saveEntry);
  document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
}

init().catch((error) => {
  console.error(error);
  $("#paper").innerHTML = `<p class="help">PairTeX could not load this manuscript: ${escapeHtml(error.message)}</p>`;
});
