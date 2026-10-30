// The "Code On The Fly" panel in the Explorer sidebar (a webview that renders the ghost state).

import * as vscode from "vscode";

// One file that currently fails its check
export interface ErrorEntry {
  file: string;
  path: string;
  output: string;
  lines: [number, string][];
  code: string;
  suggestion: string;
  status: "thinking" | "done" | "failed" | "off";
  aiError: string;
  requestId: number;
}

// Everything the panel needs to draw itself
export interface PanelState {
  color: "idle" | "clean" | "error" | "stopped";
  title: string;
  message: string;
  viewMode: string;
  fontSize: number;
  current: ErrorEntry | undefined;
  others: string[];
}

// Provides the webview and pushes state updates into it
export class PanelViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: PanelState | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onGhostClicked: () => void,
    private readonly onOpenLine: (line: number) => void,
  ) {}

  // Called by VS Code when the panel is first shown
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const mediaDir = vscode.Uri.joinPath(this.extensionUri, "media");
    const markedDir = vscode.Uri.joinPath(this.extensionUri, "node_modules", "marked", "lib");
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaDir, markedDir] };
    view.webview.html = this.html(view.webview, mediaDir, markedDir);

    // Messages from the panel: it's ready for state, the ghost was clicked, or a line link was clicked
    view.webview.onDidReceiveMessage((message: { type: string; line?: number }) => {
      if (message.type === "ready") {
        this.post();
      } else if (message.type === "ghostClicked") {
        this.onGhostClicked();
      } else if (message.type === "openLine" && message.line) {
        this.onOpenLine(message.line);
      }
    });
    view.onDidDispose(() => (this.view = undefined));
  }

  // Store the latest state and send it to the panel if it's open
  update(state: PanelState): void {
    this.state = state;
    this.post();
  }

  private post(): void {
    if (this.view && this.state) {
      this.view.webview.postMessage({ type: "state", state: this.state });
    }
  }

  // Page skeleton; panel.js fills #root from the state messages
  private html(webview: vscode.Webview, mediaDir: vscode.Uri, markedDir: vscode.Uri): string {
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const asset = (dir: vscode.Uri, file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dir, file));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset(mediaDir, "panel.css")}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${asset(markedDir, "marked.umd.js")}"></script>
  <script nonce="${nonce}" src="${asset(mediaDir, "panel.js")}"></script>
</body>
</html>`;
  }
}
