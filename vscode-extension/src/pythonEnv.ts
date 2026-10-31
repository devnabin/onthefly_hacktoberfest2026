// Gives the extension a Python with its packages installed: a private virtual environment
// in the extension's storage, created on first run and updated when requirements change.

import { spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Oldest Python the backend runs on
const MIN_VERSION: [number, number] = [3, 10];

// Pythons to look for on PATH, best first; "py -3" is the Windows launcher
const BASE_PYTHONS: [string, string[]][] = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

// Shown to the user when setup fails; message is plain text for the panel
export class PythonSetupError extends Error {}

// Run a command, sending its output to the log; rejects with the last lines on failure
function run(command: string, args: string[], log: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let text = "";
    const collect = (data: Buffer) => {
      text += data.toString();
      data.toString().split(/\r?\n/).filter(Boolean).forEach(log);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(text);
      } else {
        reject(new Error(text.trim().split("\n").slice(-5).join("\n") || `exit code ${code}`));
      }
    });
  });
}

// Find a Python on PATH that is new enough to create the environment with
async function findBasePython(log: (line: string) => void): Promise<[string, string[]]> {
  let tooOld = "";
  for (const [command, args] of BASE_PYTHONS) {
    try {
      const version = (await run(command, [...args, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], () => {})).trim();
      const [major, minor] = version.split(".").map(Number);
      if (major > MIN_VERSION[0] || (major === MIN_VERSION[0] && minor >= MIN_VERSION[1])) {
        log(`Using ${command} ${args.join(" ")} (Python ${version}) to create the environment`);
        return [command, args];
      }
      tooOld = version;
    } catch {
      // Not installed under this name; try the next one
    }
  }
  const needed = MIN_VERSION.join(".");
  throw new PythonSetupError(tooOld
    ? `Code On The Fly needs Python ${needed} or newer, but found Python ${tooOld}.`
    : `Code On The Fly needs Python ${needed} or newer, but none was found on PATH.`);
}

// Create (or update) the environment and return its Python
async function createEnvironment(context: vscode.ExtensionContext, log: (line: string) => void): Promise<string> {
  const envDir = path.join(context.globalStorageUri.fsPath, "venv");
  const envPython = process.platform === "win32"
    ? path.join(envDir, "Scripts", "python.exe")
    : path.join(envDir, "bin", "python");
  const requirements = path.join(context.extensionPath, "python", "requirements.txt");

  // A marker holds a hash of the installed requirements, so an update reinstalls only when needed
  const marker = path.join(envDir, ".requirements-hash");
  const wanted = crypto.createHash("sha256").update(fs.readFileSync(requirements)).digest("hex");
  if (fs.existsSync(envPython) && fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === wanted) {
    return envPython;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Setting up Code On The Fly (first run only)" },
    async (progress) => {
      // A folder without a working Python is a half-made environment: start over
      if (!fs.existsSync(envPython)) {
        fs.rmSync(envDir, { recursive: true, force: true });
        progress.report({ message: "creating a Python environment…" });
        const [command, args] = await findBasePython(log);
        try {
          await run(command, [...args, "-m", "venv", envDir], log);
        } catch (error) {
          throw new PythonSetupError(`Could not create a Python environment: ${(error as Error).message}\n`
            + "On Debian/Ubuntu, install the venv module with: sudo apt install python3-venv");
        }
      }

      progress.report({ message: "installing packages…" });
      try {
        await run(envPython, ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirements], log);
      } catch (error) {
        throw new PythonSetupError(`Could not install the Python packages: ${(error as Error).message}`);
      }
      fs.writeFileSync(marker, wanted);
    },
  );
  return envPython;
}

// Setup in progress, shared so several restarts in a row don't set up twice
let pending: Promise<string> | undefined;

// The Python to run the server with: the pythonPath setting, else the managed environment
export function ensurePython(context: vscode.ExtensionContext, configured: string, log: (line: string) => void): Promise<string> {
  if (configured) {
    return Promise.resolve(configured);
  }
  pending ??= createEnvironment(context, log).finally(() => {
    pending = undefined;
  });
  return pending;
}
