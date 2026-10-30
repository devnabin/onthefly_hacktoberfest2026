"""Watch demo_project, check each saved file, and ask AI to explain new errors."""

import subprocess
import sys
from pathlib import Path

from openai import OpenAIError
from watchfiles import watch

from ai_explainer import explain_error

# Folder to watch, relative to this script so it works from any directory
WATCH_DIR = (Path(__file__).parent / "demo_project").resolve()

# Where before/after copies are saved; outside WATCH_DIR so it doesn't trigger the watcher
SNAPSHOT_DIR = (Path(__file__).parent / "snapshots").resolve()

# Check command per file type; these find errors without running the code.
# Ruff catches Python syntax errors and undefined names like `printt` (F821).
COMPILERS = {
    ".js": ["node", "--check"],
    ".py": [sys.executable, "-m", "ruff", "check", "--no-cache"],
}


# Run the checker on a file. Returns (passed, output), or None if it can't be checked
def compile_file(path: Path) -> tuple[bool, str] | None:
    command = COMPILERS.get(path.suffix)
    if command is None:
        return None

    try:
        result = subprocess.run(
            [*command, str(path)], capture_output=True, text=True, timeout=30, check=False
        )
    except FileNotFoundError:
        return False, f"Compiler not found: {command[0]} (is it installed?)"
    except subprocess.TimeoutExpired:
        return False, "Compiling timed out"

    # Exit code 0 means the file compiled cleanly
    return result.returncode == 0, result.stderr or result.stdout


# Read a file's contents, or None if it no longer exists
def read_file(path: Path) -> str | None:
    try:
        return path.read_text(errors="replace")
    except (FileNotFoundError, IsADirectoryError):
        return None


# Save the working version, broken version, and error so they can be inspected later
def save_snapshots(name: Path, before: str, after: str, error: str) -> Path:
    folder = SNAPSHOT_DIR / name.parent
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name.name}.before").write_text(before)
    (folder / f"{name.name}.after").write_text(after)
    (folder / f"{name.name}.error.txt").write_text(error)
    return folder


# Watch the folder forever; check every changed file and explain any new error
def main() -> None:
    # Remember each file's current contents so we only report real changes
    last_contents = {
        path: read_file(path) for path in WATCH_DIR.rglob("*") if path.is_file()
    }

    # Remember the last version of each file that compiled cleanly (the "before")
    last_working = {}
    for path, contents in last_contents.items():
        result = compile_file(path)
        if result and result[0]:
            last_working[path] = contents

    print(f"Watching {WATCH_DIR} ... (press Ctrl+C to stop)")

    # watch() blocks and yields a set of (change, path) each time files change
    for changes in watch(WATCH_DIR):
        for path in sorted({Path(p) for _, p in changes}):
            # Folders also emit events; we only care about files
            if path.is_dir():
                continue
            current = read_file(path)

            # The OS can fire several events per save; skip if nothing changed
            if current == last_contents.get(path):
                continue
            previous = last_contents.get(path)
            last_contents[path] = current

            name = path.relative_to(WATCH_DIR)
            if current is None:
                print(f"File deleted: {name}")
                last_working.pop(path, None)
                continue

            print(f"Code changed in {name}")
            result = compile_file(path)
            if result is None:
                print(f"No compiler configured for {path.suffix or 'files without an extension'}, skipping")
                continue

            # Clean compile: this becomes the new known-good version
            passed, output = result
            if passed:
                print(f"✅ {name} compiled successfully")
                last_working[path] = current
                continue

            # Failed compile: show the full error
            print(f"❌ {name} failed to compile:")
            print(output)

            # Compare against the last working version (or the previous save if it never worked)
            before = last_working.get(path, previous or "")
            folder = save_snapshots(name, before, current, output)
            print(f"📸 Saved before/after copies to {folder}")

            # Ask Gemma to explain the error; keep watching even if the AI is unavailable
            print("🤖 Asking AI for a suggestion...\n")
            try:
                explain_error(str(name), before, current, output)
            except OpenAIError as error:
                print(f"AI explanation failed: {error}")
            print()


# Run the watcher when this file is executed directly
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped watching.")
