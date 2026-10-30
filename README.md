# Code On The Fly 👻

Code On The Fly helps you find and understand code errors while you work. It checks Python and JavaScript files when you save a change. If it finds a problem, a local AI model can explain the error and suggest a fix.

You can use it in the terminal or in a VS Code sidebar. This is a Hacktoberfest 2026 demo project.

## What it does

- Checks Python files with Ruff for syntax errors and common mistakes, such as undefined names.
- Checks JavaScript files with Node.js for syntax errors.
- Shows errors, line numbers, and AI suggestions in VS Code.
- Saves copies of the earlier code, broken code, and error message.
- Uses Ollama on your computer for AI suggestions. No cloud API key is needed.
- Lets you turn off AI suggestions in VS Code and keep using the error checks.

The tool suggests fixes. You make the changes yourself. It checks files without running your program, so it cannot catch every runtime problem.

## What you need

| Tool | Why you need it |
| --- | --- |
| Python 3.10 or later | Runs the file watcher and error checks. |
| Node.js 20 or later and npm | Builds the VS Code extension. Node.js also checks JavaScript files. |
| VS Code 1.90 or later | Runs the extension. Optional if you only use the terminal. |
| Ollama and a local model | Provides AI explanations. Optional when AI is turned off. |

For Python checks in the terminal, you only need Python and the Python packages below. AI explanations also need Ollama.

## Set up the project

Open a terminal in the project root: the folder that contains `watcher.py` and `requirements.txt`.

### 1. Install the Python packages

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

This installs `watchfiles`, `ruff`, and the `openai` Python package. The `openai` package connects to the local Ollama server.

When you open a new terminal, run the activation command again before running the Python scripts. You only need to create the environment once.

### 2. Set up AI suggestions

Install Ollama and download a model that works on your computer. To download a model, run `ollama pull MODEL_NAME`, replacing `MODEL_NAME` with the model you want to use.

Make sure Ollama is running. If it is not already running, start it in a separate terminal:

```bash
ollama serve
```

List your installed models:

```bash
ollama list
```

The project's current default model is `gemma4:12b-mlx`. That exact name must be available in your local Ollama setup. To use a different installed model:

- **VS Code:** Set `codeOnTheFly.model` to the model name shown by `ollama list`.
- **Terminal:** Change `MODEL` in `ai_explainer.py` to that model name.

The app connects to Ollama at `http://localhost:11434/v1`.

To try the VS Code extension without AI, skip the Ollama setup and set `codeOnTheFly.enableAi` to `false` in VS Code settings.

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
6. Change and save a `.py` or `.js` file inside `demo_project`.

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

## Run in the terminal

From the project root, with the Python environment active:

```bash
python watcher.py
```

Change and save a Python or JavaScript file inside `demo_project`. The terminal shows the check result and asks the local model for an explanation when it finds an error.

Press **Ctrl+C** to stop watching. Terminal mode uses the folder set by `WATCH_DIR` in `watcher.py` and the model set by `MODEL` in `ai_explainer.py`.

## VS Code settings

Click the gear beside the panel title, or run **Code On The Fly: Settings** from the Command Palette. The gear menu lets you change the view, font size, and AI setting. These quick choices are saved to your user settings and apply to other workspaces too.

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
| `codeOnTheFly.model` | `gemma4:12b-mlx` | Name of an installed Ollama model. |
| `codeOnTheFly.pythonPath` | Empty | Uses the workspace `.venv`, then `python3` (`python` on Windows). Set a path to choose another Python. |
| `codeOnTheFly.serverScript` | `server.py` | Path to the Python server, relative to the workspace or an absolute path. |
| `codeOnTheFly.fontSize` | `12` | Panel text size, from 8 to 24 pixels. |
| `codeOnTheFly.viewMode` | `default` | Information shown in the panel. See the views below. |

Changing the watch folder, model, AI setting, Python path, or server script restarts the server and clears its current error list.

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
| `ai_explainer.py` | Sends the earlier code, new code, changes, and error to the local model. |
| `server.py` | Sends check results and AI text to the VS Code extension. |
| `api.py` | Small, separate Ollama connection test. Uses `gemma3:270m`, which differs from the main default model. |
| `requirements.txt` | Python packages to install. |
| `demo_project/` | Sample files for trying the watcher. Some contain errors for testing. |
| `snapshots/` | Saved code copies and error messages. |
| `vscode-extension/src/` | Extension startup, Python process, panel, and settings code. |
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
| AI explanations fail | Make sure Ollama is running and the selected model appears in `ollama list`. Error checks still work if AI is unavailable. |
| The VS Code panel says the server stopped | Open **View → Output**, choose **Code On The Fly**, fix the reported problem, then run **Code On The Fly: Restart Server**. |
| An expected file is not checked in a workspace with several folders | The extension uses the first workspace folder. Check the watch-folder setting for that folder. |

## Screenshots

Images will be added here later.

<!-- Add screenshots here: the watching panel, an error with an AI suggestion, and the clean state after a fix. -->
