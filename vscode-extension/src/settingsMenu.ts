// The ⚙ menu in the Code On The Fly panel title bar: quick pickers that write to settings.json.

import * as vscode from "vscode";
import { currentProvider } from "./aiProvider";

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

// Ready-made punch line themes; users can also type their own
const ROAST_THEMES = ["Halloween", "Christmas", "New Year", "Valentine's Day"];

// Same rule as the Python side: short, plain words only (it goes into the AI prompt)
function validateTheme(value: string): string | undefined {
  if (value.length > 40) return "Keep it to 40 characters or fewer.";
  if (/[^\w .,'&!-]/.test(value)) return "Use letters, numbers, spaces and . , ' & ! - only.";
  return undefined;
}

// Pick or type a punch line theme; "Off" (empty) means no punch line at all
async function pickRoastTheme(current: string): Promise<string | undefined> {
  const mark = (value: string) => (value.toLowerCase() === current.toLowerCase() ? "$(check)" : "$(blank)");
  const items = [
    { label: `${mark("")} Off`, detail: "No punch line, explanations only", value: "" },
    ...ROAST_THEMES.map((theme) => ({ label: `${mark(theme)} ${theme}`, detail: undefined, value: theme })),
    { label: "$(edit) Custom theme…", detail: "Type any event or topic, e.g. Diwali, exam week, Monday", value: "custom" },
  ];
  const chosen = await vscode.window.showQuickPick(items, { title: "Punch line theme" });
  if (!chosen || chosen.value !== "custom") {
    return chosen?.value;
  }
  const typed = await vscode.window.showInputBox({
    title: "Custom punch line theme",
    value: ROAST_THEMES.includes(current) ? "" : current,
    placeHolder: "e.g. Diwali",
    validateInput: validateTheme,
    ignoreFocusOut: true,
  });
  return typed?.trim();
}

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
  const roastTheme = settings.get("roastTheme", "");
  const ai = currentProvider();

  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(layout) View", description: VIEW_MODES.find((m) => m.value === viewMode)?.label, id: "view" },
      { label: "$(text-size) Font size", description: `${fontSize}px`, id: "font" },
      { label: aiEnabled ? "$(sparkle) Turn AI suggestions off" : "$(sparkle) Turn AI suggestions on", id: "ai" },
      { label: "$(smiley) Punch line theme…", description: roastTheme || "Off", id: "roast" },
      { label: "$(cloud) AI provider…", description: `${ai.label} · ${ai.model || "no model set"}`, id: "provider" },
      ...(ai.provider === "ollama" ? [] : [{ label: `$(key) Change ${ai.label} API key…`, id: "key" }]),
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
    case "roast": {
      const theme = await pickRoastTheme(roastTheme);
      if (theme !== undefined) {
        await save("roastTheme", theme);
      }
      break;
    }
    case "provider":
      await vscode.commands.executeCommand("codeOnTheFly.chooseProvider");
      break;
    case "key":
      await vscode.commands.executeCommand("codeOnTheFly.setApiKey");
      break;
    case "all":
      await vscode.commands.executeCommand("workbench.action.openSettings", "codeOnTheFly");
      break;
  }
}
