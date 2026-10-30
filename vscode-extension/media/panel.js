// Runs inside the Code On The Fly webview: draws the ghost and the error/suggestion for each state.

const vscode = acquireVsCodeApi();
const root = document.getElementById("root");

// Escape text so code and error messages are shown as-is, never as HTML
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The full checker output
function errorSection(entry) {
  return `<h4>Error</h4><pre>${escapeHtml(entry.output.trim())}</pre>`;
}

// Each broken line of code, with its messages underneath
function linesSection(entry) {
  if (!entry.lines.length) {
    // No line numbers found in the output, so show the raw error instead
    return errorSection(entry);
  }

  // Group messages by line so a line with two problems is shown once
  const byLine = new Map();
  for (const [line, message] of entry.lines) {
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(message);
  }

  const codeLines = entry.code.split(/\r?\n/);
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, messages]) => {
      const code = codeLines[line - 1] ?? "";
      const items = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
      return `<h4>Line ${line}</h4><pre>${line} | ${escapeHtml(code)}</pre><ul>${items}</ul>`;
    })
    .join("");
}

// The AI ends its answer with "FIX: <line> | <corrected line>" for each line it changes
const FIX_LINE = /^\s*FIX:\s*(\d+)\s*\|\s?(.*)$/gm;

// Corrected lines from the AI answer, grouped by line number
function parseFixes(suggestion) {
  const fixes = new Map();
  for (const [, line, code] of suggestion.matchAll(FIX_LINE)) {
    const number = Number(line);
    if (!fixes.has(number)) fixes.set(number, []);
    fixes.get(number).push(code);
  }
  return fixes;
}

// The AI answer without the FIX lines (they're only for the "to the point" view)
function stripFixes(suggestion) {
  return suggestion.replace(FIX_LINE, "").replace(/```\w*\s*```/g, "").trim();
}

// Sorted, unique line numbers that have an error
function errorLineNumbers(entry) {
  return [...new Set(entry.lines.map(([line]) => line))].sort((a, b) => a - b);
}

// Just the line numbers; clicking one jumps to that line in the editor
function lineNumberSection(entry) {
  const numbers = errorLineNumbers(entry);
  if (!numbers.length) {
    return errorSection(entry);
  }
  const links = numbers.map((line) => `<a href="#" class="line-link" data-line="${line}">Line ${line}</a>`);
  return `<p class="line-numbers">${links.join(", ")}</p>`;
}

// Each broken line next to the AI's corrected version
function toThePointSection(entry) {
  const fixes = parseFixes(entry.suggestion);
  const numbers = [...new Set([...errorLineNumbers(entry), ...fixes.keys()])].sort((a, b) => a - b);
  if (!numbers.length) {
    return errorSection(entry);
  }

  const codeLines = entry.code.split(/\r?\n/);
  const rows = numbers.map((line) => {
    const broken = `<div class="diff bad">❌ ${line} | ${escapeHtml(codeLines[line - 1] ?? "")}</div>`;
    const fixed = (fixes.get(line) || []).map((code) => `<div class="diff good">✅ ${line} | ${escapeHtml(code)}</div>`);
    return broken + fixed.join("");
  });

  // Explain why a fixed line is missing
  let note = "";
  if (!fixes.size) {
    if (entry.status === "thinking") note = "AI is working out the fix…";
    else if (entry.status === "off") note = "Turn on AI suggestions to see the fixed line.";
    else if (entry.status === "failed") note = `AI explanation failed: ${escapeHtml(entry.aiError)}`;
    else note = "The AI didn't suggest a fixed line; switch to another view for the full answer.";
  }
  return rows.join("") + (note ? `<p class="note">${note}</p>` : "");
}

// The AI's answer (rendered as markdown) or a status note
function suggestionSection(entry) {
  let html = "<h4>🤖 Suggestion</h4>";
  if (entry.suggestion) {
    html += `<div class="markdown">${marked.parse(stripFixes(entry.suggestion))}</div>`;
  } else if (entry.status === "thinking") {
    html += `<p class="note">AI is thinking…</p>`;
  } else if (entry.status === "off") {
    html += `<p class="note">AI suggestions are off (setting <code>codeOnTheFly.enableAi</code>).</p>`;
  }
  if (entry.status === "failed") {
    html += `<p class="note">AI explanation failed: ${escapeHtml(entry.aiError)}</p>`;
  }
  return html;
}

// Which sections each view mode (codeOnTheFly.viewMode) shows
const SECTIONS = {
  default: [errorSection, suggestionSection],
  error: [errorSection],
  suggestion: [suggestionSection],
  line: [linesSection],
  line_suggestion: [linesSection, suggestionSection],
  line_number: [lineNumberSection],
  to_the_point: [toThePointSection],
};

// Draw the whole panel from the state sent by the extension
function render(state) {
  // Font size from the codeOnTheFly.fontSize setting; the CSS sizes everything from it
  document.body.style.setProperty("--panel-font-size", `${state.fontSize}px`);

  let body;
  if (state.color === "error") {
    const sections = SECTIONS[state.viewMode] || SECTIONS.default;
    body = sections.map((section) => section(state.current)).join("");
    if (state.others.length) {
      body += `<hr><p class="note">Also failing: ${state.others.map(escapeHtml).join(", ")}</p>`;
    }
  } else if (state.color === "clean") {
    body = `<p class="motivation">${escapeHtml(state.message)}</p><p class="note">Click the ghost for another one.</p>`;
  } else if (state.color === "stopped") {
    body = `<pre>${escapeHtml(state.message)}</pre><p class="note">Fix the problem, then run <b>Code On The Fly: Restart Server</b> from the Command Palette.</p>`;
  } else {
    body = `<p>${escapeHtml(state.message)}</p>`;
  }

  root.innerHTML = `
    <div class="header">
      <button id="ghost" class="ghost ${state.color}" title="Code On The Fly">👻</button>
      <div class="title">${escapeHtml(state.title)}</div>
    </div>
    <div class="body">${body}</div>`;
}

// Clicking the ghost asks the extension for a new motivation line
root.addEventListener("click", (event) => {
  if (event.target.closest("#ghost")) {
    vscode.postMessage({ type: "ghostClicked" });
  }

  // A "Line N" link: ask the extension to open the file at that line
  const link = event.target.closest(".line-link");
  if (link) {
    event.preventDefault();
    vscode.postMessage({ type: "openLine", line: Number(link.dataset.line) });
  }
});

// State updates from the extension
window.addEventListener("message", (event) => {
  if (event.data.type === "state") {
    render(event.data.state);
  }
});

// Tell the extension we're ready to receive the current state
vscode.postMessage({ type: "ready" });
