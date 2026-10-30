"""Watch demo_project and print a message whenever a file in it is saved."""

import subprocess
import sys
from pathlib import Path

from watchfiles import watch

# Folder to watch, relative to this script so it works from any directory
WATCH_DIR = (Path(__file__).parent / "demo_project").resolve()

# Check command per file type; these find errors without running the code.
# Ruff catches Python syntax errors and undefined names like `printt` (F821).
COMPILERS = {
    ".js": ["node", "--check"],
    ".py": [sys.executable, "-m", "ruff", "check", "--no-cache"],
}


# Compile a file and print the result; on failure print the full error output
def compile_file(path: Path, name: Path) -> None:
    command = COMPILERS.get(path.suffix)
    if command is None:
        print(f"No compiler configured for {path.suffix or 'files without an extension'}, skipping")
        return

    try:
        result = subprocess.run(
            [*command, str(path)], capture_output=True, text=True, timeout=30, check=False
        )
    except FileNotFoundError:
        print(f"Compiler not found: {command[0]} (is it installed?)")
        return
    except subprocess.TimeoutExpired:
        print(f"Compiling {name} timed out")
        return

    # Exit code 0 means the file compiled cleanly
    if result.returncode == 0:
        print(f"✅ {name} compiled successfully")
    else:
        print(f"❌ {name} failed to compile:")
        print(result.stderr or result.stdout)


# Read a file's contents, or None if it no longer exists
def read_file(path: Path) -> str | None:
    try:
        return path.read_text(errors="replace")
    except (FileNotFoundError, IsADirectoryError):
        return None


# Watch the folder forever and print every file whose code changed
def main() -> None:
    # Remember each file's current contents so we only report real changes
    last_contents = {
        path: read_file(path) for path in WATCH_DIR.rglob("*") if path.is_file()
    }

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
            last_contents[path] = current

            name = path.relative_to(WATCH_DIR)
            if current is None:
                print(f"File deleted: {name}")
            else:
                print(f"Code changed in {name}")
                compile_file(path, name)


# Run the watcher when this file is executed directly
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped watching.")
