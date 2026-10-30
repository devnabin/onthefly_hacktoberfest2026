# Code On The Fly 👻

Code On The Fly helps you find and understand code errors while you work. It checks Python and JavaScript files when you save a change. If it finds a problem, your chosen AI model can explain the error and suggest a fix.

You can use it in the terminal or in a VS Code sidebar. The VS Code extension supports local Ollama models, OpenAI, and other OpenAI-compatible APIs. This is a Hacktoberfest 2026 demo project.

## What it does

- Checks Python files with Ruff for syntax errors and common mistakes, such as undefined names.
- Checks JavaScript files with Node.js for syntax errors.
- Shows errors, line numbers, and AI suggestions in VS Code.
- Saves copies of the earlier code, broken code, and error message.
- Lets you choose Ollama, OpenAI, or another compatible API for AI suggestions.
- Guides you through choosing a provider, model, API address, and API key when needed.
- Stores API keys entered in VS Code in its secret storage, outside your settings file.
- Lets you turn off AI suggestions in VS Code and keep using the error checks.

The tool suggests fixes. You make the changes yourself. It checks files without running your program, so it cannot catch every runtime problem.

## What you need

| Tool | Why you need it |
| --- | --- |
| Python 3.10 or later | Runs the file watcher and error checks. |
| Node.js 20 or later and npm | Builds the VS Code extension. Node.js also checks JavaScript files. |
| VS Code 1.90 or later | Runs the extension. Optional if you only use the terminal. |
| Ollama and a local model, or access to a compatible AI API | Provides AI explanations. Optional when AI is turned off. |

For Python checks in the terminal, you only need Python and the Python packages below. The basic terminal watcher uses Ollama for AI explanations.

## Set up the project

Open a terminal in the project root: the folder that contains `watcher.py` and `requirements.txt`.

### Install the Python packages

A virtual environment keeps this project's Python packages in its own `.venv` folder. The commands below create that folder, activate the environment, and install the packages.

On macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows, using PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

This installs `watchfiles`, `ruff`, and the `openai` Python package. The `openai` package connects to Ollama, OpenAI, or your selected compatible API.

When you open a new terminal, run the activation command again before running the Python scripts. You only need to create the environment once.

## Run in VS Code

1. From the project root, install the extension's packages:

   ```bash
   cd vscode-extension
   npm ci
   cd ..
   ```

2. Open the **project root** in VS Code, so the included `.vscode` launch settings are available.
3. Press **F5**. If asked, choose **Run Code On The Fly extension**.
4. A new VS Code window opens to test the extension. This is the **Extension Development Host**.
5. In that new window, open the Explorer sidebar and expand **Code On The Fly**. You can also open the Command Palette and run **Code On The Fly: Show Panel**.
6. Run **Code On The Fly: Choose AI Provider** from the Command Palette and follow the setup below. To use checks without AI, turn off AI suggestions in the panel's gear menu instead.
7. Change and save a `.py` or `.js` file inside `demo_project`.

F5 builds the extension and starts the Python server automatically.

The extension looks for Python in the project's `.venv` folder. You can choose another Python executable with `codeOnTheFly.pythonPath`.

### Try a small example

Create `demo_project/example.py`, add this code, and save it:

```python
print("Hello, world!")
```

Now change it to the following and save again:

```python
printt("Hello, world!")
```

Ruff reports that `printt` is undefined. The panel shows the error, and the AI explains it if suggestions are enabled. Change `printt` back to `print` and save to clear the error.

The extension also shows errors in VS Code's **Problems** tab and marks the reported lines in the editor. The ghost in the status bar shows whether the tool is watching, has errors, is clean, or has stopped.

Existing files are read at startup, but results appear after you change and save a supported file. Saving the same content again does not trigger a new check.

## Choose an AI provider

Click the panel's gear, then choose **AI provider…**. You can also run **Code On The Fly: Choose AI Provider** from the Command Palette. Choose one of these options:

| Option | What it uses | What you need |
| --- | --- | --- |
| **Ollama** | A model on your Ollama server. This is the default. | Ollama running and a model already downloaded. No API key is needed. |
| **OpenAI** | OpenAI's API. | An API key and a model available to your account. |
| **Other API** | Another service with an OpenAI-compatible API, including local servers. | Its API base URL, model name, and a key if the service needs one. |

### Ollama

Install Ollama and download a model that works on your computer. Run `ollama pull MODEL_NAME`, replacing `MODEL_NAME` with the model you want to use. The extension does not download models for you.

Make sure Ollama is running. If it is not already running, start it in a separate terminal:

```bash
ollama serve
```

Choose **Ollama** in the provider menu. The extension lists installed models so you can select one. If it cannot get the list, it asks you to type a model name. You can also list installed models in the terminal:

```bash
ollama list
```

The default model is `gemma4:12b-mlx`. This exact model name must exist in your Ollama setup, or you should select a different installed model.

The default server address is `http://localhost:11434`. Change `codeOnTheFly.ollamaUrl` if needed; enter the address without `/v1`, because the extension adds it for AI requests.

### OpenAI

1. Choose **OpenAI** in the provider menu.
2. Enter your OpenAI API key.
3. Enter the model name. The default is `gpt-4o-mini`; you can choose another model available to your account.

You do not need Ollama when using this option.

### Other API

1. Choose **Other API** in the provider menu.
2. Select a service or **Custom URL…**.
3. Confirm or enter the API base URL, such as `https://api.example.com/v1`.
4. Enter that service's API key. A local service such as LM Studio may not need one.
5. Enter the model ID used by that service.

The menu includes address presets for OpenRouter, Groq, Google Gemini, DeepSeek, Mistral, Anthropic (Claude), and LM Studio. These presets fill in an address; the selected service and model still need to support OpenAI-compatible chat completions with streaming.

### API keys and code sharing

Use **Code On The Fly: Set API Key**, or the gear menu's **Change … API key…** option, to replace the key for your current provider. Keys entered here are saved in VS Code's secret storage. You do not need to put them in `settings.json`.

OpenAI and Other API have separate saved keys. Other API keeps one key for its services, so update the key when you switch services. Leaving an existing key prompt empty keeps the saved key.

If no OpenAI key is saved, the extension can use `OPENAI_API_KEY` from the environment that started VS Code. Other API uses its own saved key and does not reuse that environment key.

For each AI explanation, the tool sends the file name, the full earlier and current versions of that file, the changes between them, and the error output to your selected server. With Ollama at the default local address, these requests stay on your computer. A hosted API receives this code on its server.

You can turn off AI suggestions in the gear menu and keep using error checks.

## Run in the terminal

From the project root, with the Python environment active:

```bash
python watcher.py
```

Change and save a Python or JavaScript file inside `demo_project`. The terminal shows the check result and asks the local model for an explanation when it finds an error.

Press **Ctrl+C** to stop watching. This basic terminal mode uses local Ollama. It does not read the VS Code provider settings. Change `WATCH_DIR` in `watcher.py` to watch another folder, or `MODEL` in `ai_explainer.py` to use another installed Ollama model.

### Run the backend with another provider

For more control from the terminal, use `server.py`. It prints JSON events for the extension, so its output is different from the basic terminal watcher. The VS Code extension starts this script for you when you use F5.

For OpenAI, set your API key and choose a model:

```bash
export OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
python server.py --watch-dir demo_project --provider openai --model gpt-4o-mini
```

For another compatible API, set that service's key, base URL, and model. Replace the example values:

```bash
export OPENAI_API_KEY="YOUR_PROVIDER_API_KEY"
python server.py --watch-dir demo_project --provider custom --base-url https://api.example.com/v1 --model YOUR_MODEL_NAME
```

In PowerShell, set the key with `$env:OPENAI_API_KEY = "YOUR_API_KEY"` before running the Python command. The backend reads `OPENAI_API_KEY` for both OpenAI and custom APIs; it does not load a `.env` file automatically.

For a custom local server that needs no key, leave `OPENAI_API_KEY` unset. For checks without AI:

```bash
python server.py --watch-dir demo_project --no-ai
```

The available options are `--watch-dir`, `--provider` (`ollama`, `openai`, or `custom`), `--model`, `--base-url`, and `--no-ai`. Set `--model` to match the provider; its default is still the Ollama model name.

## VS Code settings

Click the gear beside the panel title, or run **Code On The Fly: Settings** from the Command Palette. The gear menu lets you change the view, font size, AI toggle, provider, and API key. Provider setup and other regular menu choices are saved to your user settings and apply to other workspaces too.

For settings that apply only to this project, add them to `.vscode/settings.json`. For example, this turns off AI while keeping error checks:

```json
{
  "codeOnTheFly.enableAi": false
}
```

| Setting | Default | What it changes |
| --- | --- | --- |
| `codeOnTheFly.watchFolder` | `demo_project` | Folder to check, relative to the open workspace. |
| `codeOnTheFly.enableAi` | `true` | Turns AI explanations on or off. |
| `codeOnTheFly.provider` | `ollama` | AI provider: `ollama`, `openai`, or `custom`. |
| `codeOnTheFly.model` | `gemma4:12b-mlx` | Model used by the Ollama provider. |
| `codeOnTheFly.ollamaUrl` | `http://localhost:11434` | Ollama server address, without `/v1`. |
| `codeOnTheFly.openaiModel` | `gpt-4o-mini` | Model used by the OpenAI provider. |
| `codeOnTheFly.customBaseUrl` | Empty | Full API base URL for the custom provider. |
| `codeOnTheFly.customModel` | Empty | Model ID used by the custom provider. |
| `codeOnTheFly.pythonPath` | Empty | Uses the workspace `.venv`, then `python3` (`python` on Windows). Set a path to choose another Python. |
| `codeOnTheFly.serverScript` | `server.py` | Path to the Python server, relative to the workspace or an absolute path. |
| `codeOnTheFly.fontSize` | `12` | Panel text size, from 8 to 24 pixels. |
| `codeOnTheFly.viewMode` | `default` | Information shown in the panel. See the views below. |

Changing the provider, its model or URL, watch folder, AI toggle, Python path, or server script restarts the server and clears its current error list. Saving a key with **Code On The Fly: Set API Key** also restarts the server.

### Panel views

| View value | What you see |
| --- | --- |
| `default` | Error message and AI suggestion. |
| `error` | Error message only. |
| `suggestion` | AI suggestion only. |
| `line` | Broken code lines and their error messages. |
| `line_suggestion` | Broken code lines and AI suggestion. |
| `line_number` | Line numbers you can click to open the code. |
| `to_the_point` | Broken lines and the AI's suggested fixed lines, when available. |

The panel shows the newest failing file and lists any other failing files below it.

### Commands

- **Code On The Fly: Show Panel** — opens the sidebar panel.
- **Code On The Fly: Restart Server** — restarts the file watcher.
- **Code On The Fly: Settings** — opens the quick settings menu.
- **Code On The Fly: Choose AI Provider** — guides you through provider setup.
- **Code On The Fly: Set API Key** — saves or replaces the current provider's key.

## Saved copies

When a check fails, the tool saves three files in `snapshots/`. For `example.py`, these are:

```text
snapshots/
├── example.py.before     # Last version that passed the checks
├── example.py.after      # New version with the error
└── example.py.error.txt  # Error from Ruff or Node.js
```

If a file has never passed a check, the `.before` copy uses the previous saved content, or is empty for a new file. Later failures overwrite these copies. They are useful for comparing changes, but they do not keep a full history.

The last passing version is remembered while the watcher runs. Saved copies are not loaded back into memory after a restart.

## Project files

| File or folder | Purpose |
| --- | --- |
| `watcher.py` | Watches saved changes, runs checks, and saves copies. Also runs terminal mode. |
| `ai_explainer.py` | Connects to the chosen AI provider and sends the code, changes, and error for an explanation. |
| `server.py` | Reads provider options and sends check results and AI text to the VS Code extension. |
| `api.py` | Small, separate Ollama connection test. Uses `gemma3:270m`, which differs from the main default model. |
| `requirements.txt` | Python packages to install. |
| `demo_project/` | Sample files for trying the watcher. Some contain errors for testing. |
| `snapshots/` | Saved code copies and error messages. |
| `vscode-extension/src/` | Extension startup, Python process, panel, and settings code. |
| `vscode-extension/src/aiProvider.ts` | Provider setup, API key storage, and AI options passed to Python. |
| `vscode-extension/media/` | Panel layout, styles, and browser-side code. |
| `vscode-extension/package.json` | Extension commands, settings, packages, and build scripts. |
| `.vscode/` | Launch and build tasks used when you press F5. |

To build the extension manually, run `npm run compile` inside `vscode-extension`. Use `npm run watch` to rebuild it as you edit the TypeScript source.

## Common problems

| Problem | What to check |
| --- | --- |
| Nothing happens after saving | Make a content change in a `.py` or `.js` file inside the watched folder. Other file types are skipped. |
| The watch folder is missing | Create the folder or change `codeOnTheFly.watchFolder` to an existing one. |
| A Python package is missing | Install `requirements.txt` in the Python environment the tool is using. Check `codeOnTheFly.pythonPath` if needed. |
| JavaScript checks cannot start | Make sure the `node` command is available. |
| Ollama explanations fail | Make sure Ollama is running at the configured address and the selected model appears in `ollama list`. |
| OpenAI or another API rejects a request | Check the provider's key, model name, account access, and API base URL. Use **Code On The Fly: Set API Key** to replace a saved key. |
| The server stops because AI setup is incomplete | Finish provider setup. OpenAI needs a key, and custom APIs need a base URL. You can also turn AI off to use checks without it. |
| Checks work but AI suggestions fail | Once the server has started, an AI request failure does not stop file checks. Fix the provider settings, then change and save the file to ask again. |
| The VS Code panel says the server stopped | Open **View → Output**, choose **Code On The Fly**, fix the reported problem, then run **Code On The Fly: Restart Server**. |
| An expected file is not checked in a workspace with several folders | The extension uses the first workspace folder. Check the watch-folder setting for that folder. |

## Screenshots

Images will be added here later.

<!-- Add screenshots here: the AI provider menu, provider setup, the watching panel, an error with an AI suggestion, and the clean state after a fix. -->
