// Choosing the AI that explains errors (Ollama, OpenAI, or another OpenAI-compatible API),
// storing API keys securely, and turning the choice into server.py arguments.

import * as vscode from "vscode";

export type Provider = "ollama" | "openai" | "custom";

// Shown in the provider picker
const PROVIDERS: { value: Provider; label: string; detail: string }[] = [
  { value: "ollama", label: "Ollama", detail: "Local model. Your code never leaves your machine. (default)" },
  { value: "openai", label: "OpenAI", detail: "OpenAI's API. Needs an API key; your code is sent to OpenAI." },
  { value: "custom", label: "Other API", detail: "Any OpenAI-compatible API: OpenRouter, Groq, Gemini, LM Studio, …" },
];

// Well-known OpenAI-compatible services, so users don't have to look up the address
const PRESETS: { label: string; baseUrl: string; model: string; needsKey: boolean }[] = [
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "", needsKey: true },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "", needsKey: true },
  { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "", needsKey: true },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true },
  { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "", needsKey: true },
  { label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1/", model: "", needsKey: true },
  { label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", model: "", needsKey: false },
  { label: "Custom URL…", baseUrl: "", model: "", needsKey: true },
];

// One secret per provider that uses a key
const KEY_SECRETS: Record<Exclude<Provider, "ollama">, string> = {
  openai: "codeOnTheFly.openaiApiKey",
  custom: "codeOnTheFly.customApiKey",
};

const config = () => vscode.workspace.getConfiguration("codeOnTheFly");

// Save a setting to the user's settings.json (applies to every workspace)
function save(key: string, value: unknown): Thenable<void> {
  return config().update(key, value, vscode.ConfigurationTarget.Global);
}

// The provider in use and its model, for showing in the ⚙ menu
export function currentProvider(): { provider: Provider; label: string; model: string } {
  const settings = config();
  const provider = settings.get<Provider>("provider", "ollama");
  const model = {
    ollama: settings.get("model", "gemma4:12b-mlx"),
    openai: settings.get("openaiModel", "gpt-4o-mini"),
    custom: settings.get("customModel", ""),
  }[provider];
  const label = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
  return { provider, label, model };
}

// Ask for an API key and store it in VS Code's secret storage (the OS keychain).
// Returns false if the user cancelled.
export async function askForApiKey(secrets: vscode.SecretStorage, provider: Exclude<Provider, "ollama">, optional = false): Promise<boolean> {
  const hasKey = Boolean(await secrets.get(KEY_SECRETS[provider]));
  const name = provider === "openai" ? "OpenAI" : "API";
  const key = await vscode.window.showInputBox({
    title: `${name} key`,
    prompt: hasKey
      ? "A key is already saved. Paste a new one to replace it, or press Enter to keep it."
      : optional
        ? "This service may not need a key. Leave empty if it doesn't."
        : "Stored securely in VS Code's secret storage, never in settings.json.",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) {
    return false;
  }
  if (key.trim()) {
    await secrets.store(KEY_SECRETS[provider], key.trim());
  }
  return true;
}

// Ask for a model name; returns undefined if cancelled
function askForModel(title: string, current: string, placeHolder: string): Thenable<string | undefined> {
  return vscode.window.showInputBox({ title, value: current, placeHolder, ignoreFocusOut: true });
}

// Models installed in Ollama, so the user can pick instead of typing (empty if Ollama isn't reachable)
async function ollamaModels(ollamaUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = (await response.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((model) => model.name);
  } catch {
    return [];
  }
}

// Ollama setup: pick one of the installed models (or type a name if Ollama isn't running)
async function setUpOllama(): Promise<boolean> {
  const settings = config();
  const ollamaUrl = settings.get("ollamaUrl", "http://localhost:11434");
  const current = settings.get("model", "gemma4:12b-mlx");

  const installed = await ollamaModels(ollamaUrl);
  let model: string | undefined;
  if (installed.length) {
    const chosen = await vscode.window.showQuickPick(
      installed.map((name) => ({ label: `${name === current ? "$(check)" : "$(blank)"} ${name}`, name })),
      { title: "Ollama model", placeHolder: "Models installed in Ollama" },
    );
    model = chosen?.name;
  } else {
    vscode.window.showWarningMessage(`Couldn't reach Ollama at ${ollamaUrl}. Start Ollama, or type the model name.`);
    model = await askForModel("Ollama model", current, "e.g. gemma4:12b-mlx");
  }
  if (!model) {
    return false;
  }
  await save("model", model);
  return true;
}

// OpenAI setup: API key, then model
async function setUpOpenAi(secrets: vscode.SecretStorage): Promise<boolean> {
  if (!(await askForApiKey(secrets, "openai"))) {
    return false;
  }
  const model = await askForModel("OpenAI model", config().get("openaiModel", "gpt-4o-mini"), "e.g. gpt-4o-mini");
  if (!model) {
    return false;
  }
  await save("openaiModel", model);
  return true;
}

// Other API setup: service, base URL, API key, model
async function setUpCustom(secrets: vscode.SecretStorage): Promise<boolean> {
  const preset = await vscode.window.showQuickPick(
    PRESETS.map((p) => ({ label: p.label, description: p.baseUrl, preset: p })),
    { title: "Which service?", placeHolder: "Pick a service, or Custom URL for anything else" },
  );
  if (!preset) {
    return false;
  }

  // Base URL: prefilled from the preset (or the last one used for Custom URL)
  const baseUrl = await vscode.window.showInputBox({
    title: "API base URL",
    value: preset.preset.baseUrl || config().get("customBaseUrl", ""),
    placeHolder: "e.g. https://api.example.com/v1",
    prompt: "The OpenAI-compatible endpoint, usually ending in /v1",
    ignoreFocusOut: true,
    validateInput: (value) => (/^https?:\/\/\S+$/.test(value.trim()) ? undefined : "Enter a URL starting with http:// or https://"),
  });
  if (!baseUrl) {
    return false;
  }

  if (!(await askForApiKey(secrets, "custom", !preset.preset.needsKey))) {
    return false;
  }

  const model = await askForModel(
    `Model name for ${preset.preset.label}`,
    preset.preset.model || config().get("customModel", ""),
    "The model ID from the service's docs",
  );
  if (!model) {
    return false;
  }

  await save("customBaseUrl", baseUrl.trim());
  await save("customModel", model.trim());
  return true;
}

// Guided setup: pick a provider, then fill in only what that provider needs.
// The provider setting is saved last, so the server restarts once with everything in place.
export async function chooseProvider(secrets: vscode.SecretStorage): Promise<void> {
  const current = currentProvider().provider;
  const chosen = await vscode.window.showQuickPick(
    PROVIDERS.map((p) => ({ label: `${p.value === current ? "$(check)" : "$(blank)"} ${p.label}`, detail: p.detail, value: p.value })),
    { title: "Which AI should explain errors?" },
  );
  if (!chosen) {
    return;
  }

  const completed = {
    ollama: () => setUpOllama(),
    openai: () => setUpOpenAi(secrets),
    custom: () => setUpCustom(secrets),
  }[chosen.value];
  if (!(await completed())) {
    return;
  }

  await save("provider", chosen.value);
  const { label, model } = currentProvider();
  vscode.window.showInformationMessage(`Code On The Fly now uses ${label} · ${model}.`);
}

// server.py arguments and environment for the chosen provider (the key goes in env, never in args)
export async function serverAiOptions(secrets: vscode.SecretStorage): Promise<{ args: string[]; env: NodeJS.ProcessEnv }> {
  const settings = config();
  const { provider, model } = currentProvider();
  const args = ["--provider", provider, "--model", model];
  const env: NodeJS.ProcessEnv = {};

  if (provider === "ollama") {
    args.push("--base-url", `${settings.get("ollamaUrl", "http://localhost:11434").replace(/\/$/, "")}/v1`);
  } else if (provider === "openai") {
    // Saved key first; otherwise OPENAI_API_KEY from the environment is used as-is
    const savedKey = await secrets.get(KEY_SECRETS.openai);
    if (savedKey) {
      env.OPENAI_API_KEY = savedKey;
    }
  } else {
    // Only the key saved for this service, never an inherited OPENAI_API_KEY,
    // so an OpenAI key is never sent to a different company's server
    args.push("--base-url", settings.get("customBaseUrl", ""));
    env.OPENAI_API_KEY = (await secrets.get(KEY_SECRETS.custom)) ?? "";
  }
  return { args, env };
}
