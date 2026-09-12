const state = {
  mode: "edit",
  kind: null,
  selection: null,
  project: null,
  editingEntry: null,
  editBaselines: new Map(),
  editMarkupBaselines: new Map(),
  mathSourceBaselines: new Map(),
  editTimers: new Map(),
  editDirty: new Set(),
  mathDirty: new Set(),
  mathBlock: null,
  mathBaseline: "",
  targetByEntryId: new Map(),
  paperRoot: null,
  paperShadow: null,
  threadEntry: null,
};

function initThemeControls() {
  const root = document.documentElement;
  document.body.dataset.pairtexHost = "true";
  const modeSelect = $("#theme-mode");
  const paletteSelect = $("#theme-palette");
  const palettes = window.PairTeXPalettes || {};
  Object.entries(palettes).forEach(([id, palette]) => {
    if ([...paletteSelect.options].some((option) => option.value === id)) return;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = palette.label || id;
    paletteSelect.append(option);
  });
  const mode = localStorage.getItem("pairtex-color-mode") || "system";
  const palette = localStorage.getItem("pairtex-palette-v2") || Object.keys(palettes)[0] || "ocean";
  modeSelect.value = ["system", "light", "dark"].includes(mode) ? mode : "system";
  paletteSelect.value = palettes[palette] ? palette : Object.keys(palettes)[0];
  const apply = () => {
    const effectiveMode = modeSelect.value === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : modeSelect.value;
    if (modeSelect.value === "system") delete root.dataset.colorMode;
    else root.dataset.colorMode = effectiveMode;
    root.dataset.palette = paletteSelect.value;
    const rawTokens = palettes[paletteSelect.value]?.[effectiveMode];
    const tokens = rawTokens && {
      ...rawTokens,
      link: rawTokens.link || rawTokens.accent,
      linkHover: rawTokens.linkHover || rawTokens.accent,
      linkVisited: rawTokens.linkVisited || rawTokens.accent,
    };
    if (tokens) Object.entries(tokens).forEach(([name, value]) => {
      root.style.setProperty(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
    });
    if (tokens) {
      Object.entries(tokens).forEach(([name, value]) => {
        const property = `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
        document.body.style.setProperty(property, value);
      });
      document.body.style.setProperty("background-color", tokens.bg, "important");
      document.body.style.setProperty("color", tokens.fg, "important");
      const paper = $("#paper");
      if (paper) {
        Object.entries(tokens).forEach(([name, value]) => {
          const property = `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
          paper.style.setProperty(property, value);
        });
        paper.style.setProperty("background-color", tokens.bg, "important");
        paper.style.setProperty("color", tokens.fg, "important");
      }
    }
    localStorage.setItem("pairtex-color-mode", modeSelect.value);
    localStorage.setItem("pairtex-palette-v2", paletteSelect.value);
  };
  modeSelect.addEventListener("change", apply);
  paletteSelect.addEventListener("change", apply);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  apply();
}

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function paperQueryAll(selector) {
  return [...(state.paperRoot?.querySelectorAll(selector) || [])];
}

function paperChildren() {
  return [...(state.paperRoot?.children || [])];
}

function panelId(name) {
  return `section-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document"}`;
}

function wrapTables() {
  paperQueryAll("table:not(.equation)").forEach((table) => {
    if (table.parentElement?.classList.contains("table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.append(table);
  });
}

function cleanRendererArtifacts() {
  const paper = state.paperRoot;
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  const removable = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const beforeFirstSection = !node.parentElement?.closest("section, h2, h3, h4");
    if (beforeFirstSection && /^\s*_+\s*$/.test(node.textContent || "")) removable.push(node);
  }
  removable.forEach((node) => node.remove());
}

function organizePaper() {
  const paper = state.paperRoot;
  const children = paperChildren();
  const topLevelSections = children.filter((node) => node.matches("section[data-section], section.abstract"));
  const sectionHeads = children.filter((node) => node.matches("h3.sectionHead, h3.likesectionHead"));
  if (!topLevelSections.length && !sectionHeads.length) return;

  const home = document.createElement("div");
  home.className = "paper-panel is-active";
  home.dataset.panel = "home";
  const sectionPanels = [];

  if (sectionHeads.length) {
    const homeNodes = [];
    let panel = null;
    children.forEach((node) => {
      if (node.matches("h3.sectionHead")) {
        const name = node.textContent.replace(/^\s*\d+\s*/, "").trim();
        panel = document.createElement("div");
        panel.className = "paper-panel";
        panel.dataset.panel = panelId(name);
        panel.dataset.sectionName = name;
        panel.append(node);
        sectionPanels.push({ name, panel });
      } else if (node.matches(".tableofcontents")) {
        homeNodes.push(node);
      } else if (panel) {
        panel.append(node);
      } else {
        homeNodes.push(node);
      }
    });
    homeNodes.forEach((node) => home.append(node));
  } else paperChildren().forEach((node) => {
    if (!node.matches("section[data-section], section.abstract")) {
      home.append(node);
      return;
    }
    const name = (node.dataset.section || "Abstract").trim();
    if (name.toLowerCase() === "abstract") {
      home.append(node);
      return;
    }
    const panel = document.createElement("div");
    panel.className = "paper-panel";
    panel.dataset.panel = panelId(name);
    panel.dataset.sectionName = name;
    panel.append(node);
    sectionPanels.push({ name, panel });
  });

  paper.replaceChildren(home, ...sectionPanels.map(({ panel }) => panel));
  const tabs = $("#paper-tabs");
  tabs.innerHTML = [
    { label: "Home", panel: "home" },
    ...sectionPanels.map(({ name, panel }) => ({ label: name, panel: panel.dataset.panel })),
  ].map(({ label, panel }, index) => `<button class="paper-tab${index === 0 ? " is-active" : ""}" data-panel-target="${escapeHtml(panel)}" role="tab" aria-selected="${index === 0}">${escapeHtml(label)}</button>`).join("");
  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-panel-target]");
    if (!tab) return;
    activatePaperPanel(tab.dataset.panelTarget, tab);
  });
}

function activatePaperPanel(target, selectedTab = null) {
  document.querySelectorAll(".paper-tab").forEach((item) => {
    const active = selectedTab ? item === selectedTab : item.dataset.panelTarget === target;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
  });
  paperQueryAll(".paper-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === target));
}

function markFallbackEditableText() {
  paperQueryAll("p").forEach((block) => {
    if (block.dataset.editable || block.closest(".thebibliography, figure, figcaption, .tableofcontents")) return;
    if (block.querySelector("img, table, svg")) return;
    if (block.querySelector("math, [data-editable=\"math\"]")) {
      // Keep formulas independent while allowing surrounding prose to be edited.
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent.trim() && !node.parentElement.closest('math, [data-editable="math"], [data-editable="text"]')) nodes.push(node);
      }
      nodes.forEach((node) => {
        const span = document.createElement("span");
        span.dataset.editable = "text";
        span.dataset.sourceText = node.textContent.trim();
        span.dataset.section = block.closest(".paper-panel")?.dataset.sectionName || "";
        node.replaceWith(span);
        span.append(node);
      });
      return;
    }
    const text = block.innerText.trim();
    if (!text) return;
    block.dataset.editable = "text";
    block.dataset.sourceText = text;
    block.dataset.section = block.dataset.section || block.closest(".paper-panel")?.dataset.sectionName || "";
  });
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

function entryTarget(entry) {
  if (entry.anchor?.source_mapping === "unmapped") {
    const selected = entry.anchor.selected_rendered_text?.trim().normalize("NFKC");
    if (!selected) return null;
    const candidates = paperQueryAll('[data-source-mapping="unmapped"]').filter(node =>
      node.textContent.normalize("NFKC").includes(selected)
      && (node.closest('.paper-panel')?.dataset.sectionName || '') === (entry.anchor.section || []).join('/'));
    // Repeated expressions need stronger evidence; do not highlight an unrelated block.
    return candidates.length === 1 ? candidates[0] : null;
  }
  return paperQueryAll("[data-source-file], [data-editable=\"text\"]").find((node) => {
    const section = (node.dataset.section || "").split("/").filter(Boolean);
    const fileMatches = entry.anchor?.file_hint
      ? node.dataset.sourceFile === entry.anchor.file_hint
      : !node.dataset.sourceFile;
    return fileMatches
      && section.join("/") === (entry.anchor?.section || []).join("/");
  });
}

function renderedOffset(entry) {
  const storedOffset = entry.anchor?.rendered_offset;
  if (Number.isFinite(storedOffset) && storedOffset >= 0) return storedOffset;
  const target = entryTarget(entry);
  if (!target) return Number.MAX_SAFE_INTEGER;
  const text = target.textContent.trim();
  const selected = (entry.anchor?.selected_rendered_text || "").trim();
  const offset = selected ? text.indexOf(selected) : -1;
  return offset >= 0 ? offset : Number.MAX_SAFE_INTEGER;
}

function manuscriptSelection() {
  return state.paperShadow?.getSelection?.() || window.getSelection();
}

function selectedAnchor() {
  const selection = manuscriptSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null;
  const node = selection.anchorNode?.parentElement?.closest("[data-source-file], [data-editable=\"text\"], [data-source-mapping=\"unmapped\"]");
  if (!node) return null;
  const text = selection.toString().trim();
  const blockText = node.textContent.trim();
  const index = blockText.indexOf(text);
  return {
    file_hint: node.dataset.sourceFile || null,
    source_mapping: node.dataset.sourceMapping || undefined,
    line_start_hint: Number(node.dataset.sourceLine || 0) || null,
    line_end_hint: Number(node.dataset.sourceLineEnd || node.dataset.sourceLine || 0) || null,
    section: (node.dataset.section || (node.dataset.sourceMapping === "unmapped" ? node.closest(".paper-panel")?.dataset.sectionName : "") || "").split("/").filter(Boolean),
    selected_rendered_text: text,
    selected_source_text: node.dataset.sourceMapping === "unmapped" ? null : node.dataset.sourceText || text,
    rendered_offset: index >= 0 ? index : null,
    prefix_context: index > 0 ? blockText.slice(Math.max(0, index - 80), index) : "",
    suffix_context: index >= 0 ? blockText.slice(index + text.length, index + text.length + 80) : "",
  };
}

function showTools() {
  if (state.mode === "edit") {
    $("#selection-tools").hidden = true;
    return;
  }
  const anchor = selectedAnchor();
  const selection = manuscriptSelection();
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
  const orderedEntries = sortEntries(entries.filter((entry) => entry.status !== "resolved"));
  let changeNumber = 0;
  $("#entry-count").textContent = orderedEntries.length;
  $("#entries").innerHTML = orderedEntries.length ? orderedEntries.map((entry) => {
    const payload = entry.payload || {};
    const body = payload.comment || payload.proposed_content || "Change intent";
    const lifecycle = entry.status === "resolved" ? "resolved" : "open";
    const decision = entry.kind === "change" ? ` · ${entry.decision || (entry.status === "pending" ? "pending" : "accepted")}` : "";
    const kind = `${entry.kind === "change" ? "change" : "comment"}${decision} · ${lifecycle}`;
    const number = entry.kind === "change" ? ++changeNumber : null;
    const thread = Array.isArray(entry.thread) ? entry.thread : [];
    const threadMarkup = thread.length ? `<div class="entry__thread">${thread.map((message) => `
      <div class="thread-message">
        <div class="thread-message__meta">${escapeHtml(message.author || "anonymous")} · ${escapeHtml(message.role || "reply")}</div>
        <p>${escapeHtml(message.body || "")}</p>
      </div>`).join("")}</div>` : "";
    return `<article class="entry${lifecycle === "resolved" ? " is-resolved" : ""}" data-entry-id="${escapeHtml(entry.id)}">
      <div class="entry__top"><span>${number ? `<b class="entry__number">${number}</b>` : ""}${escapeHtml(kind)}</span><span>${escapeHtml(entry.author || "anonymous")}</span></div>
      <p class="entry__quote">“${escapeHtml(entry.anchor?.selected_rendered_text || "Document location") }”</p>
      <p class="entry__body">${escapeHtml(body)}</p>
      ${threadMarkup}
      <div class="entry__meta">${escapeHtml(entry.anchor?.file_hint || "unknown source")} · ${escapeHtml((entry.anchor?.section || []).join(" / ") || "document")}${entry.worktree_dirty ? " · local changes" : ""}</div>
      <div class="entry__actions"><button data-entry-action="locate">Locate</button><button data-entry-action="reply">Reply</button><button data-entry-action="edit">Edit</button><button data-entry-action="delete">Delete</button></div>
    </article>`;
  }).join("") : `<p class="help">No feedback entries yet.</p>`;
}

function openThreadDialog(entry) {
  state.threadEntry = entry;
  $("#thread-quote").textContent = `“${entry.anchor?.selected_rendered_text || "Document location"}”`;
  $("#thread-message").value = "";
  $("#thread-dialog").showModal();
}

async function saveThreadReply(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save" || !state.threadEntry) {
    $("#thread-dialog").close();
    return;
  }
  const body = $("#thread-message").value.trim();
  if (!body) return;
  const entry = state.threadEntry;
  const updated = {
    ...entry,
    thread: [...(Array.isArray(entry.thread) ? entry.thread : []), {
      id: crypto.randomUUID(),
      author: state.project.author || "human",
      role: "human",
      body,
      created_at: new Date().toISOString(),
    }],
  };
  const response = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!response.ok) {
    alert("Could not add the reply.");
    return;
  }
  const saved = await response.json();
  state.project.entries = state.project.entries.map((item) => item.id === saved.id ? saved : item);
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
  state.threadEntry = null;
  $("#thread-dialog").close();
}

function decoratePaper(entries) {
  const orderedEntries = sortEntries(entries.filter((entry) => entry.status !== "resolved"));
  state.targetByEntryId.clear();
  paperQueryAll("[data-source-file], [data-editable=\"text\"], [data-source-mapping=\"unmapped\"]").forEach((node) => {
    node.classList.remove("has-feedback", "has-number", "is-focused");
    node.removeAttribute("data-feedback-id");
    node.removeAttribute("data-feedback-number");
  });
  let changeNumber = 0;
  orderedEntries.forEach((entry) => {
    const target = entryTarget(entry);
    if (target) {
      target.classList.add("has-feedback");
      state.targetByEntryId.set(entry.id, target);
      if (entry.kind === "change") {
        target.classList.add("has-number");
        target.dataset.feedbackNumber = String(++changeNumber);
      }
    }
  });
}

function captureEditBaselines() {
  state.editDirty.clear();
  state.mathDirty.clear();
  state.editMarkupBaselines = new Map(
    paperQueryAll('[data-editable="text"], [data-editable="math"]').map((node) => [node, node.innerHTML]),
  );
  state.mathSourceBaselines = new Map(
    paperQueryAll('[data-editable="math"]').map((node) => [node, node.dataset.mathSource || ""]),
  );
  state.editBaselines = new Map(
    paperQueryAll('[data-editable="text"]').map((node) => [node, node.innerText.trim()]),
  );
}

function updateSaveButton() {
  const dirty = state.editDirty.size + state.mathDirty.size > 0;
  $("#save-edits").hidden = state.mode !== "edit";
  $("#save-edits").disabled = !dirty;
  $("#save-edits").textContent = dirty ? `Save edits (${state.editDirty.size + state.mathDirty.size})` : "Save edits";
  $("#discard-edits").hidden = state.mode !== "edit";
  $("#discard-edits").disabled = !dirty;
}

function discardEdits() {
  if (state.mode !== "edit") return;
  for (const block of state.editDirty) {
    const baseline = state.editMarkupBaselines.get(block);
    if (baseline !== undefined) block.innerHTML = baseline;
  }
  for (const block of state.mathDirty) {
    const baselineMarkup = state.editMarkupBaselines.get(block);
    const baselineSource = state.mathSourceBaselines.get(block);
    if (baselineMarkup !== undefined) block.innerHTML = baselineMarkup;
    if (baselineSource !== undefined) block.dataset.mathSource = baselineSource;
  }
  state.editDirty.clear();
  state.mathDirty.clear();
  updateSaveButton();
}

async function persistDirectEdit(block) {
  const originalText = state.editBaselines.get(block) || "";
  const currentText = block.innerText.trim();
  const existing = state.project.entries.find((entry) => entry.id === block.dataset.directEditId);
  if (currentText === originalText) {
    if (existing) {
      await fetch(`/api/entries/${encodeURIComponent(existing.id)}`, { method: "DELETE" });
      state.project.entries = state.project.entries.filter((entry) => entry.id !== existing.id);
      delete block.dataset.directEditId;
      renderEntries(state.project.entries);
      decoratePaper(state.project.entries);
    }
    return;
  }
  const entry = existing || {
    id: crypto.randomUUID(),
    kind: "change",
    status: "open",
    decision: "accepted",
    head_commit: state.project.head_commit,
    worktree_dirty: state.project.worktree_dirty,
    git_status: state.project.git_status,
    author: state.project.author || undefined,
    anchor: {
      file_hint: block.dataset.sourceFile,
      line_start_hint: Number(block.dataset.sourceLine || 0) || null,
      line_end_hint: Number(block.dataset.sourceLineEnd || block.dataset.sourceLine || 0) || null,
      section: (block.dataset.section || "").split("/").filter(Boolean),
      selected_rendered_text: originalText,
      selected_source_text: block.dataset.sourceText || originalText,
      rendered_offset: 0,
      prefix_context: "",
      suffix_context: "",
    },
    payload: {},
    created_at: new Date().toISOString(),
  };
  entry.payload = { operation: "replace", proposed_content: currentText };
  const editing = Boolean(existing);
  const response = await fetch(editing ? `/api/entries/${encodeURIComponent(entry.id)}` : "/api/entries", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) return;
  const saved = await response.json();
  block.dataset.directEditId = saved.id;
  if (editing) {
    state.project.entries = state.project.entries.map((item) => item.id === saved.id ? saved : item);
  } else {
    state.project.entries.push(saved);
  }
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
}

function scheduleDirectEdit(event) {
  if (state.mode !== "edit") return;
  const block = event.target.closest('[data-editable="text"]');
  if (!block) return;
  state.editDirty.add(block);
  updateSaveButton();
}

// Each draft conversion owns its TeX state. Never reset the paper's labels or
// redefine commands in its input jax: MathJax 3 can retain macro definitions.
let draftMathQueue = Promise.resolve();
let mathPreviewRevision = 0;

function renderDraftMath(source, display = true) {
  const task = draftMathQueue.then(async () => {
    const mathjax = window.MathJax;
    if (!mathjax?.startup?.promise) return null;
    await mathjax.startup.promise;
    const startup = mathjax.startup;
    const original = startup.document?.inputJax.find(jax => jax.name === "TeX");
    if (!original || !startup.handler || !mathjax._?.mathjax?.mathjax) return null;
    const input = new original.constructor({
      ...mathjax.config.tex,
      packages: [...original.options.packages],
      // Labels belong to canonical equations, not their transient previews.
      macros: {...mathjax.config.tex.macros, label: ["", 1]},
    });
    const doc = startup.handler.create(document.implementation.createHTMLDocument(""), {InputJax: [input]});
    input.parseOptions.tags.allLabels = Object.fromEntries(
      Object.entries(original.parseOptions.tags.allLabels).map(([key, value]) => [key, {...value}]),
    );
    const markup = await mathjax._.mathjax.mathjax.handleRetriesFor(() =>
      startup.toMML(doc.convert(source, {display, end: mathjax._.core.MathItem.STATE.CONVERT})),
    );
    const parsed = new DOMParser().parseFromString(markup, "application/xml");
    if (parsed.querySelector("parsererror")) throw new Error("Could not render formula preview");
    return document.importNode(parsed.documentElement, true);
  });
  draftMathQueue = task.catch(() => {});
  return task;
}

async function renderSourceMath() {
  const notice = $("#math-status");
  notice.hidden = !state.paperRoot?.querySelector('math, [data-editable="math"]');
  notice.textContent = "Math converter unavailable or still loading. Showing the renderer's original formulas; edited formulas use TeX source until it loads. Check your connection and refresh to retry.";
  if (!window.MathJax?.startup?.promise) return;
  try {
    await window.MathJax.startup.promise;
  } catch {
    return;
  }
  if (!window.MathJax.tex2mmlPromise) return;
  notice.hidden = true;
  const root = state.paperRoot;
  for (const block of root.querySelectorAll('[data-math-source]')) {
    const target = block.querySelector('.math-render');
    if (!target || state.mathDirty.has(block)) continue;
    const display = target.querySelector('math')?.getAttribute('display') === 'block';
    let markup;
    try {
      markup = await window.MathJax.tex2mmlPromise(block.dataset.mathSource, { display });
    } catch {
      continue; // A converter failure must not remove the renderer's fallback.
    }
    if (root !== state.paperRoot) return;
    if (state.mathDirty.has(block)) continue;
    const parsed = new DOMParser().parseFromString(markup, 'application/xml');
    // A project's custom TeX macros may be unknown to MathJax. Preserve its
    // renderer output rather than replacing it with an error in that case.
    if (parsed.querySelector('merror, parsererror')) continue;
    // Native MathML also works inside the paper's shadow root without
    // depending on MathJax's document-level CHTML stylesheets.
    target.replaceChildren(document.importNode(parsed.documentElement, true));
  }
}

async function renderMathPreview(source) {
  const preview = $("#math-preview");
  const revision = ++mathPreviewRevision;
  preview.textContent = source;
  preview.dataset.renderState = "pending";
  try {
    const math = await renderDraftMath(source);
    if (revision !== mathPreviewRevision) return;
    if (math) preview.replaceChildren(math);
    preview.dataset.renderState = math ? "ready" : "source";
  } catch (error) {
    if (revision !== mathPreviewRevision) return;
    preview.textContent = `${source} — Preview unavailable: ${error.message}`;
    preview.dataset.renderState = "error";
  }
}

function openMathEditor(block) {
  if (state.mode !== "edit") return;
  state.mathBlock = block;
  state.mathBaseline = block.dataset.mathSource || "";
  $("#math-source").value = state.mathBaseline;
  renderMathPreview(state.mathBaseline);
  $("#math-dialog").showModal();
}

async function saveMathEdit(event) {
  event.preventDefault();
  if (event.submitter?.value !== "save" || !state.mathBlock) {
    $("#math-dialog").close();
    return;
  }
  const block = state.mathBlock;
  const source = $("#math-source").value.trim();
  if (!source) return;
  if (source === state.mathBaseline) {
    $("#math-dialog").close();
    state.mathBlock = null;
    return;
  }
  const revision = mathPreviewRevision;
  const target = block.querySelector(".math-render");
  const display = target.querySelector("math")?.getAttribute("display") === "block";
  let math = null;
  try {
    math = await renderDraftMath(source, display);
  } catch {
    // Keep the complete draft readable and saveable when conversion fails.
  }
  if (state.mathBlock !== block || revision !== mathPreviewRevision || !block.isConnected) return;
  block.dataset.mathSource = source;
  if (math) target.replaceChildren(math);
  else target.textContent = source;
  state.mathDirty.add(block);
  updateSaveButton();
  $("#math-dialog").close();
  state.mathBlock = null;
}

async function persistMathEdit(block) {
  const existing = state.project.entries.find((entry) => entry.id === block.dataset.mathEditId);
  const entry = existing || {
    id: crypto.randomUUID(),
    kind: "change",
    status: "open",
    decision: "accepted",
    head_commit: state.project.head_commit,
    worktree_dirty: state.project.worktree_dirty,
    git_status: state.project.git_status,
    author: state.project.author || undefined,
    anchor: {
      file_hint: block.dataset.sourceFile,
      line_start_hint: Number(block.dataset.sourceLine || 0) || null,
      line_end_hint: Number(block.dataset.sourceLineEnd || block.dataset.sourceLine || 0) || null,
      section: (block.dataset.section || "").split("/").filter(Boolean),
      selected_rendered_text: state.mathSourceBaselines.get(block) || "",
      selected_source_text: state.mathSourceBaselines.get(block) || "",
      rendered_offset: 0,
      prefix_context: "",
      suffix_context: "",
    },
    payload: {},
    created_at: new Date().toISOString(),
  };
  entry.payload = { operation: "replace", proposed_content: block.dataset.mathSource };
  const editing = Boolean(existing);
  const response = await fetch(editing ? `/api/entries/${encodeURIComponent(entry.id)}` : "/api/entries", {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) return;
  const saved = await response.json();
  block.dataset.mathEditId = saved.id;
  state.project.entries = editing
    ? state.project.entries.map((item) => item.id === saved.id ? saved : item)
    : [...state.project.entries, saved];
}

async function saveEdits() {
  if (state.mode !== "edit") return;
  const textDrafts = [...state.editDirty];
  const mathDrafts = [...state.mathDirty];
  for (const block of textDrafts) await persistDirectEdit(block);
  for (const block of mathDrafts) await persistMathEdit(block);
  state.editDirty.clear();
  state.mathDirty.clear();
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
  updateSaveButton();
  setMode("review");
}

function setMode(mode) {
  state.mode = mode;
  state.paperRoot.contentEditable = "false";
  paperQueryAll('[data-editable="text"]').forEach((block) => {
    block.contentEditable = mode === "edit" ? "true" : "false";
  });
  state.paperRoot.classList.toggle("is-editing", mode === "edit");
  $("#change-action").textContent = mode === "edit" ? "Edit text" : "Suggest edit";
  $("#mode-hint").textContent = mode === "edit"
    ? "Edit the manuscript directly. Changes are recorded as accepted intents."
    : "Select text to record a pending proposal for review.";
  document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("is-active", item.dataset.mode === mode));
  updateSaveButton();
}

function locateEntry(entry) {
  const target = state.targetByEntryId.get(entry.id);
  const card = document.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`);
  if (!target || !card) return;
  paperQueryAll(".has-feedback").forEach((node) => node.classList.remove("is-focused"));
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
  $("#save-entry").textContent = kind === "change"
    ? (state.mode === "edit" ? "Save edit" : "Save proposal")
    : "Save comment";
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
  $("#save-entry").textContent = entry.kind === "change" ? "Save proposal" : "Save comment";
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
    status: "open",
    decision: kind === "change" ? (state.mode === "edit" ? "accepted" : "pending") : null,
    head_commit: state.project.head_commit,
    worktree_dirty: state.project.worktree_dirty,
    git_status: state.project.git_status,
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

async function refreshView() {
  const response = await fetch(`/api/state?refresh=${Date.now()}`, { cache: "no-store" });
  const project = await response.json();
  if (!response.ok) throw new Error(project.error || "Could not read the manuscript");
  state.project = project;
  const template = document.createElement("template");
  template.innerHTML = state.project.manuscript_html;
  const sourceBody = template.content.querySelector("body");
  const sourceHead = template.content.querySelector("head");
  const host = $("#paper");
  if (!state.paperShadow) {
    state.paperShadow = host.attachShadow({ mode: "open" });
    state.paperShadow.addEventListener("mouseup", showTools);
    state.paperShadow.addEventListener("keyup", showTools);
    state.paperShadow.addEventListener("input", scheduleDirectEdit);
    state.paperShadow.addEventListener("click", (event) => {
      const math = event.target.closest('[data-editable="math"]');
      if (math) openMathEditor(math);
      const link = event.target.closest(".tableofcontents a[href^='#']");
      if (!link) return;
      const targetId = decodeURIComponent(link.getAttribute("href").slice(1));
      const target = paperQueryAll("[id]").find((node) => node.id === targetId);
      if (!target) return;
      event.preventDefault();
      const panel = target.closest(".paper-panel");
      activatePaperPanel(panel?.dataset.panel || "home");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  state.paperShadow.replaceChildren();
  const rendererLinks = [];
  if (sourceHead) {
    sourceHead.querySelectorAll('link[rel="stylesheet"][href]').forEach((link) => {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = link.getAttribute("href");
      rendererLinks.push(stylesheet);
    });
    sourceHead.querySelectorAll("style").forEach((style) => {
      const rendererStyle = document.createElement("style");
      rendererStyle.textContent = style.textContent;
      rendererLinks.push(rendererStyle);
    });
  }
  const pairtexStylesheet = document.createElement("link");
  pairtexStylesheet.rel = "stylesheet";
  pairtexStylesheet.href = `/style.css?shadow=${Date.now()}`;
  const renderRoot = document.createElement("div");
  renderRoot.className = "paper";
  renderRoot.dataset.pairtexRenderRoot = "true";
  renderRoot.append(...(sourceBody ? [...sourceBody.childNodes] : [...template.content.childNodes]));
  state.paperShadow.append(...rendererLinks, pairtexStylesheet, renderRoot);
  state.paperRoot = renderRoot;
  renderRoot.style.setProperty("background-color", "var(--bg)", "important");
  renderRoot.style.setProperty("color", "var(--fg)", "important");
  cleanRendererArtifacts();
  wrapTables();
  organizePaper();
  markFallbackEditableText();
  captureEditBaselines();
  const unmapped = renderRoot.querySelector('[data-source-mapping="unmapped"]');
  $("#mapping-status").hidden = !unmapped;
  $("#mapping-status").textContent = "Formulas are read-only because their source locations could not be verified. You can select them for comments. Use a renderer adapter with source anchors to enable formula editing.";
  renderSourceMath().catch(console.error);
  $("#version-status").textContent = ({ not_repository: "Not under Git", unborn: "No source commit yet", clean: "Git version tracked", dirty: "Local changes", unavailable: "Git status unavailable" })[state.project.git_status] || "Git status unavailable";
  renderEntries(state.project.entries);
  decoratePaper(state.project.entries);
}

async function refreshFromServer() {
  if (state.editDirty.size || state.mathDirty.size) {
    if (!confirm("Refresh and discard unsaved local edits?")) return;
  }
  const button = $("#refresh-view");
  button.disabled = true;
  button.textContent = "Refreshing…";
  try {
    await refreshView();
    setMode(state.mode);
  } catch (error) {
    alert(`Could not refresh the manuscript: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Refresh";
  }
}

async function init() {
  initThemeControls();
  await refreshView();
  window.addEventListener('load', () => renderSourceMath().catch(console.error), { once: true });
  setMode("edit");
  document.addEventListener("selectionchange", showTools);
  $("#selection-tools").addEventListener("mousedown", (event) => event.preventDefault());
  $("#selection-tools").addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action) openEntryDialog(action === "change" ? "change" : "comment");
  });
  $("#entry-form").addEventListener("submit", saveEntry);
  $("#save-edits").addEventListener("click", saveEdits);
  $("#discard-edits").addEventListener("click", discardEdits);
  $("#refresh-view").addEventListener("click", refreshFromServer);
  $("#math-source").addEventListener("input", (event) => renderMathPreview(event.target.value));
  $("#math-form").addEventListener("submit", saveMathEdit);
  $("#math-dialog").addEventListener("close", () => {
    ++mathPreviewRevision;
    state.mathBlock = null;
  });
  $("#cancel-math").addEventListener("click", () => {
    state.mathBlock = null;
    $("#math-dialog").close();
  });
  $("#cancel-entry").addEventListener("click", () => {
    state.editingEntry = null;
    $("#entry-dialog").close();
  });
  $("#thread-form").addEventListener("submit", saveThreadReply);
  $("#cancel-thread").addEventListener("click", () => {
    state.threadEntry = null;
    $("#thread-dialog").close();
  });
  $("#entries").addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.entryAction;
    if (!action) return;
    const entryId = event.target.closest("[data-entry-id]")?.dataset.entryId;
    const entry = state.project.entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (action === "edit") openExistingEntry(entry);
    if (action === "reply") openThreadDialog(entry);
    if (action === "delete") deleteEntry(entry);
    if (action === "locate") locateEntry(entry);
  });
  document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.mode === "review" && (state.editDirty.size || state.mathDirty.size)) {
      alert("Save your Edit mode changes before switching to Review.");
      return;
    }
    setMode(button.dataset.mode);
  }));
}

init().catch((error) => {
  console.error(error);
  $("#paper").innerHTML = `<p class="help">PairTeX could not load this manuscript: ${escapeHtml(error.message)}</p>`;
});
