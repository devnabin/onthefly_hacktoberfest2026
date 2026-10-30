"""Watch demo_project and print a message whenever a file in it is saved."""

from pathlib import Path

from watchfiles import watch

# Folder to watch, relative to this script so it works from any directory
WATCH_DIR = (Path(__file__).parent / "demo_project").resolve()


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


# Run the watcher when this file is executed directly
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped watching.")
