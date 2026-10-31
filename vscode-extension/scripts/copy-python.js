// Copy the Python backend from the repo root into the extension, so the packaged
// extension ships its own server.py and doesn't need it in the user's workspace.

const fs = require("fs");
const path = require("path");

const FILES = ["server.py", "watcher.py", "ai_explainer.py", "requirements.txt"];
const source = path.join(__dirname, "..", "..");
const target = path.join(__dirname, "..", "python");

fs.mkdirSync(target, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(path.join(source, file), path.join(target, file));
}
