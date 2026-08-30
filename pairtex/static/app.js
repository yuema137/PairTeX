const state = {
  mode: "edit",
  kind: null,
  selection: null,
  project: null,
  editingEntry: null,
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftAnchor = left.anchor || {};
    const rightAnchor = right.anchor || {};
    const fileOrder = (leftAnchor.file_hint || "").localeCompare(rightAnchor.file_hint || "");
    if (fileOrder) return fileOrder;
    const sectionOrder = (leftAnchor.section || []).join("/").localeCompare((rightAnchor.section || []).join("/"));
    if (sectionOrder) return sectionOrder;
    const leftLine = Number.isFinite(leftAnchor.line_start_hint) && leftAnchor.line_start_hint > 0 ? leftAnchor.line_start_hint : Number.MAX_SAFE_INTEGER;
    const rightLine = Number.isFinite(rightAnchor.line_start_hint) && rightAnchor.line_start_hint > 0 ? rightAnchor.line_start_hint : Number.MAX_SAFE_INTEGER;
    if (leftLine !== rightLine) return leftLine - rightLine;
    const leftOffset = renderedOffset(left);
    const rightOffset = renderedOffset(right);
    if (leftOffset !== rightOffset) return leftOffset - rightOffset;
    return (left.created_at || "").localeCompare(right.created_at || "");
  });
}

function renderedOffset(entry) {
  const storedOffset = entry.anchor?.rendered_offset;
  if (Number.isFinite(storedOffset) && storedOffset >= 0) return storedOffset;
  const target = [...document.querySelectorAll("[data-source-file]")].find((node) => {
    const section = (node.dataset.section || "").split("/").filter(Boolean);
    return node.dataset.sourceFile === entry.anchor?.file_hint
      && section.join("/") === (entry.anchor?.section || []).join("/");
  });
  if (!target) return Number.MAX_SAFE_INTEGER;
  const text = target.textContent.trim();
  const selected = (entry.anchor?.selected_rendered_text || "").trim();
  const offset = selected ? text.indexOf(selected) : -1;
  return offset >= 0 ? offset : Number.MAX_SAFE_INTEGER;
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
    rendered_offset: index >= 0 ? index : null,
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
  const orderedEntries = sortEntries(entries);
  let changeNumber = 0;
  $("#entry-count").textContent = orderedEntries.length;
  $("#entries").innerHTML = orderedEntries.length ? orderedEntries.map((entry) => {
    const payload = entry.payload || {};
    const body = payload.comment || payload.proposed_content || "Change intent";
    const kind = entry.kind === "change" ? `change · ${entry.status}` : "comment";
    const number = entry.kind === "change" ? ++changeNumber : null;
    return `<article class="entry" data-entry-id="${escapeHtml(entry.id)}">
      <div class="entry__top"><span>${number ? `<b class="entry__number">${number}</b>` : ""}${escapeHtml(kind)}</span><span>${escapeHtml(entry.author || "anonymous")}</span></div>
      <p class="entry__quote">“${escapeHtml(entry.anchor?.selected_rendered_text || "Document location") }”</p>
      <p class="entry__body">${escapeHtml(body)}</p>
      <div class="entry__meta">${escapeHtml(entry.anchor?.file_hint || "unknown source")} · ${escapeHtml((entry.anchor?.section || []).join(" / ") || "document")}${entry.worktree_dirty ? " · local changes" : ""}</div>
      <div class="entry__actions"><button data-entry-action="locate">Locate</button><button data-entry-action="edit">Edit</button><button data-entry-action="delete">Delete</button></div>
    </article>`;
  }).join("") : `<p class="help">No feedback entries yet.</p>`;
}

function decoratePaper(entries) {
  const orderedEntries = sortEntries(entries);
  document.querySelectorAll("[data-source-file]").forEach((node) => {
    node.classList.remove("has-feedback", "has-number", "is-focused");
    node.removeAttribute("data-feedback-id");
    node.removeAttribute("data-feedback-number");
  });
  let changeNumber = 0;
  orderedEntries.forEach((entry) => {
    const target = [...document.querySelectorAll("[data-source-file]")].find((node) => {
      const section = (node.dataset.section || "").split("/").filter(Boolean);
      return node.dataset.sourceFile === entry.anchor?.file_hint
        && section.join("/") === (entry.anchor?.section || []).join("/");
    });
    if (target) {
      target.classList.add("has-feedback");
      target.dataset.feedbackId = entry.id;
      if (entry.kind === "change") {
        target.classList.add("has-number");
        target.dataset.feedbackNumber = String(++changeNumber);
      }
    }
  });
}

function locateEntry(entry) {
  const target = document.querySelector(`[data-feedback-id="${CSS.escape(entry.id)}"]`);
  const card = document.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`);
  if (!target || !card) return;
  document.querySelectorAll(".has-feedback").forEach((node) => node.classList.remove("is-focused"));
  document.querySelectorAll(".entry").forEach((node) => node.classList.remove("is-focused"));
  target.classList.add("is-focused");
  card.classList.add("is-focused");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openEntryDialog(kind) {
  if (!state.selection) return;
  state.kind = kind;
  $("#dialog-kind").textContent = kind === "change" ? "Change proposal" : "Comment";
  $("#dialog-title").textContent = kind === "change"
    ? (state.mode === "edit" ? "Edit manuscript" : "Propose an edit")
    : "Add comment";
  $("#message-label").textContent = kind === "change" ? "Additional instructions (optional)" : "Comment";
  $("#dialog-quote").textContent = `“${state.selection.selected_rendered_text}”`;
  $("#change-label").hidden = kind !== "change";
  $("#message").value = "";
  $("#message").required = kind !== "change";
  $("#proposed-text").value = kind === "change" ? state.selection.selected_rendered_text : "";
  $("#proposed-text").required = kind === "change";
  $("#entry-dialog").showModal();
}

function openExistingEntry(entry) {
  state.editingEntry = entry;
  state.kind = entry.kind;
  $("#dialog-kind").textContent = entry.kind === "change" ? "Change proposal" : "Comment";
  $("#dialog-title").textContent = entry.kind === "change" ? "Edit change proposal" : "Edit comment";
  $("#dialog-quote").textContent = `“${entry.anchor?.selected_rendered_text || "Document location"}”`;
  $("#change-label").hidden = entry.kind !== "change";
  $("#message-label").textContent = entry.kind === "change" ? "Additional instructions (optional)" : "Comment";
  $("#message").required = entry.kind !== "change";
  $("#message").value = entry.kind === "change" ? entry.payload?.instruction || "" : entry.payload?.comment || "";
  $("#proposed-text").required = entry.kind === "change";
  $("#proposed-text").value = entry.kind === "change" ? entry.payload?.proposed_content || "" : "";
  $("#entry-dialog").showModal();
}

async function deleteEntry(entry) {
  if (!confirm("Delete this feedback entry?")) return;
  const response = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
  if (!response.ok) {
    alert("Could not delete the entry.");
    return;
  }
  state.project.entries = state.project.entries.filter((item) => item.id !== entry.id);
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
}

async function saveEntry(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save") {
    $("#entry-dialog").close();
    return;
  }
  const kind = state.kind;
  const entry = state.editingEntry || {
    id: crypto.randomUUID(),
    kind,
    status: kind === "change" && state.mode === "edit" ? "accepted" : kind === "change" ? "pending" : "open",
    head_commit: state.project.head_commit,
    worktree_dirty: state.project.worktree_dirty,
    author: state.project.author || undefined,
    anchor: state.selection,
    payload: {},
    created_at: new Date().toISOString(),
  };
  entry.payload = kind === "change" ? {
      operation: "replace",
      instruction: $("#message").value.trim() || undefined,
      proposed_content: $("#proposed-text").value.trim(),
    } : { comment: $("#message").value.trim() };
  const editing = Boolean(state.editingEntry);
  const response = await fetch(editing ? `/api/entries/${encodeURIComponent(entry.id)}` : "/api/entries", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    alert("Could not save the entry.");
    return;
  }
  const saved = await response.json();
  if (editing) {
    state.project.entries = state.project.entries.map((item) => item.id === saved.id ? saved : item);
  } else {
    state.project.entries.push(saved);
  }
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
  $("#entry-dialog").close();
  $("#selection-tools").hidden = true;
  state.editingEntry = null;
  window.getSelection()?.removeAllRanges();
}

async function init() {
  state.project = await (await fetch("/api/state")).json();
  $("#paper").innerHTML = state.project.manuscript_html;
  $("#version-status").textContent = state.project.worktree_dirty ? "Local changes" : "Git version tracked";
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
  document.addEventListener("selectionchange", showTools);
  $("#selection-tools").addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action) openEntryDialog(action === "change" ? "change" : "comment");
  });
  $("#entry-form").addEventListener("submit", saveEntry);
  $("#cancel-entry").addEventListener("click", () => {
    state.editingEntry = null;
    $("#entry-dialog").close();
  });
  $("#entries").addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.entryAction;
    if (!action) return;
    const entryId = event.target.closest("[data-entry-id]")?.dataset.entryId;
    const entry = state.project.entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (action === "edit") openExistingEntry(entry);
    if (action === "delete") deleteEntry(entry);
    if (action === "locate") locateEntry(entry);
  });
  document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
}

init().catch((error) => {
  console.error(error);
  $("#paper").innerHTML = `<p class="help">PairTeX could not load this manuscript: ${escapeHtml(error.message)}</p>`;
});
