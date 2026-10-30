"""Watch demo_project, check each saved file, and ask AI to explain new errors."""

import re
import subprocess
import sys
import threading
from collections.abc import Callable
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

# Ruff: a "CODE message" line followed by " --> path:line:column"
RUFF_LOCATION = re.compile(r"^(\S.*)\n\s*--> .*?:(\d+):\d+", re.MULTILINE)

# Node: "path:line" on the first line and "SomethingError: message" further down
NODE_LOCATION = re.compile(r"^.*:(\d+)\s*$", re.MULTILINE)
NODE_MESSAGE = re.compile(r"^(\w*Error: .*)$", re.MULTILINE)

# Called after every check: (name, passed, output, before, after)
ResultCallback = Callable[[Path, bool, str, str, str], None]

# Called when a watched file is deleted: (name)
DeletedCallback = Callable[[Path], None]


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


# Pull (line number, message) pairs out of the checker output, in order of appearance
def find_error_lines(output: str) -> list[tuple[int, str]]:
    ruff_matches = RUFF_LOCATION.findall(output)
    if ruff_matches:
        return [(int(line), message.strip()) for message, line in ruff_matches]

    # Node reports a single error: location first, message after the code excerpt
    location = NODE_LOCATION.search(output)
    message = NODE_MESSAGE.search(output)
    if location and message:
        return [(int(location.group(1)), message.group(1).strip())]
    return []


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


# Watch the folder until stop_event is set; check every changed file and report the result.
# Used by the terminal mode below and by server.py (the VS Code extension backend).
def watch_and_check(
    on_result: ResultCallback,
    on_deleted: DeletedCallback | None = None,
    stop_event: threading.Event | None = None,
    directory: Path = WATCH_DIR,
) -> None:
    # Remember each file's current contents so we only report real changes
    last_contents = {
        path: read_file(path) for path in directory.rglob("*") if path.is_file()
    }

    # Remember the last version of each file that compiled cleanly (the "before")
    last_working = {}
    for path, contents in last_contents.items():
        result = compile_file(path)
        if result and result[0]:
            last_working[path] = contents

    # watch() blocks and yields a set of (change, path) each time files change
    for changes in watch(directory, stop_event=stop_event):
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

            name = path.relative_to(directory)
            if current is None:
                last_working.pop(path, None)
                if on_deleted:
                    on_deleted(name)
                continue

            # Skip file types we don't know how to check
            result = compile_file(path)
            if result is None:
                continue

            # Clean compile: this becomes the new known-good version
            passed, output = result
            if passed:
                last_working[path] = current
                on_result(name, True, output, current, current)
                continue

            # Failed compile: compare against the last working version
            # (or the previous save if it never worked) and keep copies
            before = last_working.get(path, previous or "")
            save_snapshots(name, before, current, output)
            on_result(name, False, output, before, current)


# Terminal mode: print each result and the AI suggestion for errors
def print_result(name: Path, passed: bool, output: str, before: str, after: str) -> None:
    print(f"Code changed in {name}")
    if passed:
        print(f"✅ {name} compiled successfully")
        return

    # Show the full error, then ask Gemma; keep watching even if the AI is unavailable
    print(f"❌ {name} failed to compile:")
    print(output)
    print(f"📸 Saved before/after copies to {SNAPSHOT_DIR}")
    print("🤖 Asking AI for a suggestion...\n")
    try:
        explain_error(str(name), before, after, output)
    except OpenAIError as error:
        print(f"AI explanation failed: {error}")
    print()


# Run the watcher in the terminal when this file is executed directly
if __name__ == "__main__":
    print(f"Watching {WATCH_DIR} ... (press Ctrl+C to stop)")
    try:
        watch_and_check(print_result, lambda name: print(f"File deleted: {name}"))
    except KeyboardInterrupt:
        print("\nStopped watching.")
