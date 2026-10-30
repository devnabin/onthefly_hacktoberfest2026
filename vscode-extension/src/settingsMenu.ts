// The ⚙ menu in the Code On The Fly panel title bar: quick pickers that write to settings.json.

import * as vscode from "vscode";

// Views the panel can show when a file has an error
const VIEW_MODES: { value: string; label: string }[] = [
  { value: "default", label: "Default (error + AI suggestion)" },
  { value: "error", label: "Error message only" },
  { value: "suggestion", label: "AI suggestion only" },
  { value: "line", label: "Error line only" },
  { value: "line_suggestion", label: "Error line + AI suggestion" },
  { value: "line_number", label: "Line number only" },
  { value: "to_the_point", label: "To the point (error line → fixed line)" },
];

// Font sizes offered in the picker (any number can still be typed in settings.json)
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18];

const config = () => vscode.workspace.getConfiguration("codeOnTheFly");

// Save a setting to the user's settings.json (applies to every workspace)
function save(key: string, value: unknown): Thenable<void> {
  return config().update(key, value, vscode.ConfigurationTarget.Global);
}

// Let the user pick one option; the current one is marked with a check
async function pick<T>(title: string, options: { value: T; label: string }[], current: T): Promise<T | undefined> {
  const items = options.map((option) => ({
    label: `${option.value === current ? "$(check)" : "$(blank)"} ${option.label}`,
    value: option.value,
  }));
  const chosen = await vscode.window.showQuickPick(items, { title });
  return chosen?.value;
}

// Top-level menu: choose which setting to change
export async function showSettingsMenu(): Promise<void> {
  const settings = config();
  const viewMode = settings.get("viewMode", "default");
  const fontSize = settings.get("fontSize", 12);
  const aiEnabled = settings.get("enableAi", true);

  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(layout) View", description: VIEW_MODES.find((m) => m.value === viewMode)?.label, id: "view" },
      { label: "$(text-size) Font size", description: `${fontSize}px`, id: "font" },
      { label: aiEnabled ? "$(sparkle) Turn AI suggestions off" : "$(sparkle) Turn AI suggestions on", id: "ai" },
      { label: "$(settings-gear) Open all Code On The Fly settings…", id: "all" },
    ],
    { title: "Code On The Fly settings" },
  );

  switch (choice?.id) {
    case "view": {
      const mode = await pick("What should the panel show?", VIEW_MODES, viewMode);
      if (mode) {
        await save("viewMode", mode);
      }
      break;
    }
    case "font": {
      const sizes = FONT_SIZES.map((size) => ({ value: size, label: `${size}px` }));
      const size = await pick("Panel font size", sizes, fontSize);
      if (size) {
        await save("fontSize", size);
      }
      break;
    }
    case "ai":
      await save("enableAi", !aiEnabled);
      break;
    case "all":
      await vscode.commands.executeCommand("workbench.action.openSettings", "codeOnTheFly");
      break;
  }
}
