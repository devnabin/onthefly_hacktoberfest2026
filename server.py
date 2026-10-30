"""Background server for the VS Code extension.

Watches a folder, checks each saved file, and prints every event to stdout as one
JSON object per line. The extension starts this script and reads those lines.
"""

import argparse
import itertools
import json
import sys
import threading
from pathlib import Path

from openai import OpenAIError

from ai_explainer import MODEL, explain_error, make_client
from watcher import WATCH_DIR, find_error_lines, watch_and_check

# Several threads (watcher + AI requests) print events, so writes must not interleave
send_lock = threading.Lock()


# Send one event to the extension as a single line of JSON
def send(event: dict) -> None:
    with send_lock:
        sys.stdout.write(json.dumps(event) + "\n")
        sys.stdout.flush()


# Read the settings the extension passes on the command line
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch-dir", type=Path, default=WATCH_DIR)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--provider", choices=["ollama", "openai", "custom"], default="ollama",
                        help="openai and custom read their API key from OPENAI_API_KEY")
    parser.add_argument("--base-url", help="API address for custom (or a non-default Ollama)")
    parser.add_argument("--no-ai", action="store_true", help="don't ask the AI to explain errors")
    return parser.parse_args()


# Watch the folder forever and report every check, plus streamed AI suggestions
def main() -> None:
    args = parse_args()
    watch_dir = args.watch_dir.resolve()
    if not watch_dir.is_dir():
        send({"type": "fatal", "message": f"Watch folder not found: {watch_dir}"})
        sys.exit(1)

    # Connect to the AI provider up front so a missing API key is reported right away
    api_client = None
    if not args.no_ai:
        try:
            api_client = make_client(args.provider, args.base_url)
        except (OpenAIError, ValueError) as error:
            send({"type": "fatal", "message": f"Could not set up {args.provider}: {error}"})
            sys.exit(1)

    # Each check gets an id so the extension can ignore suggestions for outdated errors
    request_ids = itertools.count(1)

    # Stream the AI suggestion; runs on its own thread so checks stay instant
    def ask_ai(request_id: int, name: Path, before: str, after: str, output: str) -> None:
        try:
            explain_error(
                str(name),
                before,
                after,
                output,
                on_chunk=lambda text: send({"type": "ai_chunk", "request_id": request_id, "text": text}),
                model=args.model,
                api_client=api_client,
            )
            send({"type": "ai_done", "request_id": request_id, "error": ""})
        except OpenAIError as error:
            send({"type": "ai_done", "request_id": request_id, "error": str(error)})

    # Called by the watcher after every check
    def on_result(name: Path, passed: bool, output: str, before: str, after: str) -> None:
        request_id = next(request_ids)
        ai_enabled = not passed and not args.no_ai
        send({
            "type": "result",
            "file": str(name),
            "path": str(watch_dir / name),
            "passed": passed,
            "output": output,
            "lines": find_error_lines(output),
            "code": after,
            "request_id": request_id,
            "ai": ai_enabled,
        })
        if ai_enabled:
            threading.Thread(
                target=ask_ai,
                args=(request_id, name, before, after, output),
                daemon=True,
            ).start()

    # Called by the watcher when a file is deleted
    def on_deleted(name: Path) -> None:
        send({"type": "deleted", "file": str(name), "path": str(watch_dir / name)})

    send({"type": "ready", "watch_dir": str(watch_dir), "provider": args.provider, "model": args.model, "ai": not args.no_ai})
    watch_and_check(on_result, on_deleted, directory=watch_dir)


# Run the server; Ctrl+C or the extension closing stdin/killing us just exits quietly
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
