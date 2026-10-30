// Entry point: runs server.py in the background and shows its results inside VS Code.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ErrorEntry, PanelViewProvider, PanelState } from "./panelView";
import { PythonServer, ServerEvent } from "./server";
import { askForApiKey, chooseProvider, currentProvider, serverAiOptions } from "./aiProvider";
import { showSettingsMenu } from "./settingsMenu";

// Shown when every check passes (and the user clicks the ghost for a new one)
const MOTIVATION = [
  "You are clean, keep coding, keep focus! 🚀",
  "No bugs in sight. Stay in the flow! 🌊",
  "Clean code, clear mind. Keep going! 💪",
  "Zero errors. The ghost is proud of you! 👻",
  "All checks passed. Ship it (after tests)! 🛳️",
];

// Settings that change how Python runs; changing any of them restarts the server
const SERVER_SETTINGS = [
  "watchFolder", "enableAi", "roastTheme", "pythonPath", "serverScript",
  "provider", "model", "ollamaUrl", "openaiModel", "customBaseUrl", "customModel",
];

// Icon shown next to the punch line, matched loosely to the theme
function themeIcon(theme: string): string {
  const name = theme.toLowerCase();
  if (name.includes("halloween")) return "🎃";
  if (name.includes("christmas") || name.includes("xmas")) return "🎄";
  if (name.includes("new year")) return "🎆";
  if (name.includes("valentine")) return "❤️";
  return "🎭";
}

const randomMotivation = () => MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)];

// Wire up the panel, status bar, squiggles, and the Python server
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Code On The Fly");
  const diagnostics = vscode.languages.createDiagnosticCollection("codeOnTheFly");
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "codeOnTheFly.showPanel";
  statusBar.show();

  // What the extension knows; errors keeps insertion order so the newest is last
  const errors = new Map<string, ErrorEntry>();
  let checkedAny = false;
  let serverRunning = false;
  let serverMessage = "Starting…";
  let fatalMessage = "";
  let motivation = randomMotivation();

  const view = new PanelViewProvider(
    context.extensionUri,
    () => {
      motivation = randomMotivation();
      render();
    },
    // Open the file with the newest error and put the cursor on the clicked line
    (line) => {
      const newest = [...errors.values()].at(-1);
      if (newest) {
        const position = new vscode.Position(line - 1, 0);
        vscode.window.showTextDocument(vscode.Uri.file(newest.path), { selection: new vscode.Range(position, position) });
      }
    },
  );

  const config = () => vscode.workspace.getConfiguration("codeOnTheFly");

  // Redraw the status bar ghost and the panel from the current state
  function render(): void {
    const newest = [...errors.values()].at(-1);
    let state: Omit<PanelState, "fontSize" | "roastIcon">;
    if (!serverRunning) {
      state = { color: "stopped", title: "⚠️ Code On The Fly stopped", message: serverMessage, viewMode: "", current: undefined, others: [] };
    } else if (newest) {
      const others = [...errors.keys()].filter((file) => file !== newest.file);
      state = { color: "error", title: `❌ Error in ${newest.file}`, message: "", viewMode: config().get("viewMode", "default"), current: newest, others };
    } else if (checkedAny) {
      state = { color: "clean", title: "✅ All clean", message: motivation, viewMode: "", current: undefined, others: [] };
    } else {
      state = { color: "idle", title: "👻 Watching", message: serverMessage, viewMode: "", current: undefined, others: [] };
    }
    view.update({ ...state, fontSize: config().get("fontSize", 12), roastIcon: themeIcon(config().get("roastTheme", "")) });

    // Status bar: red background on errors, green text when clean
    statusBar.text = { stopped: "👻 Stopped", error: `👻 ${errors.size} error${errors.size === 1 ? "" : "s"}`, clean: "👻 Clean", idle: "👻 Watching" }[state.color];
    statusBar.backgroundColor = state.color === "error" ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
    statusBar.color = state.color === "clean" ? new vscode.ThemeColor("testing.iconPassed") : undefined;
    statusBar.tooltip = state.title;
  }

  // Red squiggles on each reported line, also listed in the Problems tab
  function showDiagnostics(filePath: string, lines: [number, string][], code: string): void {
    const codeLines = code.split(/\r?\n/);
    diagnostics.set(
      vscode.Uri.file(filePath),
      lines.map(([line, message]) => {
        const text = codeLines[line - 1] ?? "";
        const start = text.length - text.trimStart().length;
        const range = new vscode.Range(line - 1, start, line - 1, Math.max(text.length, start + 1));
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = "Code On The Fly";
        return diagnostic;
      }),
    );
  }

  // The error entry an AI message belongs to; undefined if that error is outdated
  function entryForRequest(requestId: unknown): ErrorEntry | undefined {
    return [...errors.values()].find((entry) => entry.requestId === requestId);
  }

  // Update state from one server.py event
  function handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case "ready":
        serverRunning = true;
        serverMessage = `Watching ${event.watch_dir} … save a file to check it.`;
        break;

      case "result": {
        const file = event.file as string;
        const hadErrors = errors.size > 0;
        checkedAny = true;

        // Re-insert failures so the newest one is shown
        errors.delete(file);
        if (event.passed) {
          diagnostics.delete(vscode.Uri.file(event.path as string));
        } else {
          errors.set(file, {
            file,
            path: event.path as string,
            output: event.output as string,
            lines: event.lines as [number, string][],
            code: event.code as string,
            suggestion: "",
            status: event.ai ? "thinking" : "off",
            aiError: "",
            requestId: event.request_id as number,
          });
          showDiagnostics(event.path as string, event.lines as [number, string][], event.code as string);
        }

        // Celebrate when the last error is fixed
        if (hadErrors && errors.size === 0) {
          motivation = `🎉 Fixed! ${randomMotivation()}`;
        }
        break;
      }

      case "ai_chunk": {
        const entry = entryForRequest(event.request_id);
        if (entry) {
          entry.suggestion += event.text as string;
        }
        break;
      }

      case "ai_done": {
        const entry = entryForRequest(event.request_id);
        if (entry) {
          entry.status = event.error ? "failed" : "done";
          entry.aiError = event.error as string;
        }
        break;
      }

      case "deleted":
        errors.delete(event.file as string);
        diagnostics.delete(vscode.Uri.file(event.path as string));
        break;

      // server.py explains why it's about to exit (e.g. watch folder missing)
      case "fatal":
        fatalMessage = event.message as string;
        break;
    }
    render();
  }

  const server = new PythonServer(
    handleEvent,
    (message) => {
      serverRunning = false;
      serverMessage = fatalMessage || message;
      output.appendLine(message);
      render();
    },
    (line) => output.appendLine(line),
  );

  // Pick the Python to use: the setting, then the workspace .venv, then python3 on PATH
  function resolvePython(root: string): string {
    const configured = config().get<string>("pythonPath", "");
    if (configured) {
      return configured;
    }
    const venvPython = process.platform === "win32"
      ? path.join(root, ".venv", "Scripts", "python.exe")
      : path.join(root, ".venv", "bin", "python");
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    return process.platform === "win32" ? "python" : "python3";
  }

  // Restart shortly after settings change; a guided setup saves several settings at once,
  // and this makes them cause a single restart
  let restartTimer: NodeJS.Timeout | undefined;
  function scheduleRestart(): void {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => void startServer(), 300);
  }

  // (Re)start server.py with the current settings and a clean slate
  async function startServer(): Promise<void> {
    errors.clear();
    diagnostics.clear();
    checkedAny = false;
    serverRunning = false;
    serverMessage = "Starting…";
    fatalMessage = "";

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      serverMessage = "Open a folder to start Code On The Fly.";
      render();
      return;
    }

    const settings = config();
    const script = path.resolve(root, settings.get("serverScript", "server.py"));
    const ai = await serverAiOptions(context.secrets);
    const args = ["-u", script, "--watch-dir", path.resolve(root, settings.get("watchFolder", "demo_project")), ...ai.args];
    if (!settings.get("enableAi", true)) {
      args.push("--no-ai");
    }
    // Punch line only when the user has entered a theme
    const roastTheme = settings.get("roastTheme", "").trim();
    if (roastTheme) {
      args.push("--roast-theme", roastTheme);
    }

    // Mark as running right away; if Python fails, onStopped flips it back
    serverRunning = true;
    server.start(resolvePython(root), args, root, ai.env);
    render();
  }

  context.subscriptions.push(
    output,
    diagnostics,
    statusBar,
    vscode.window.registerWebviewViewProvider("codeOnTheFly.panel", view),
    vscode.commands.registerCommand("codeOnTheFly.showPanel", () => vscode.commands.executeCommand("codeOnTheFly.panel.focus")),
    vscode.commands.registerCommand("codeOnTheFly.restart", startServer),
    vscode.commands.registerCommand("codeOnTheFly.settings", showSettingsMenu),

    // Guided setup: Ollama, OpenAI, or another API (with whatever that provider needs)
    vscode.commands.registerCommand("codeOnTheFly.chooseProvider", () => chooseProvider(context.secrets)),

    // Change the API key of the provider in use
    vscode.commands.registerCommand("codeOnTheFly.setApiKey", async () => {
      const { provider } = currentProvider();
      if (provider === "ollama") {
        vscode.window.showInformationMessage("Ollama runs locally and doesn't need an API key.");
      } else if (await askForApiKey(context.secrets, provider)) {
        scheduleRestart();
      }
    }),

    // React to settings.json changes: display settings redraw, the rest restarts Python
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (SERVER_SETTINGS.some((name) => change.affectsConfiguration(`codeOnTheFly.${name}`))) {
        scheduleRestart();
      } else if (change.affectsConfiguration("codeOnTheFly.viewMode") || change.affectsConfiguration("codeOnTheFly.fontSize")) {
        render();
      }
    }),

    // Stop Python when VS Code closes or the extension is disabled
    { dispose: () => server.stop() },
  );

  startServer();
}

export function deactivate(): void {}
