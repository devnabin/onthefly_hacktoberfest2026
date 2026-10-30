"""Start the desktop ghost: watch demo_project in the background and show the results."""

import itertools
import os
import signal
import stat
import sys
import threading
from pathlib import Path

import PySide6
from openai import OpenAIError
from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QApplication

from ai_explainer import explain_error
from ghost_window import GhostWindow
from watcher import WATCH_DIR, watch_and_check


# Signals carry results from background threads to the ghost.
# Qt delivers them on the UI thread, so the window is only touched from there.
class Bridge(QObject):
    checked = Signal(str, bool, str, str, int)  # name, passed, output, code, request_id
    deleted = Signal(str)  # name
    ai_chunk = Signal(int, str)  # request_id, text
    ai_done = Signal(int, str)  # request_id, error message ("" on success)


# On macOS, files in .venv can get the "hidden" flag. Qt skips hidden plugin files and
# then crashes with "Could not find the Qt platform plugin cocoa", so clear the flag first.
def unhide_qt_plugins() -> None:
    if sys.platform != "darwin":
        return
    plugins_dir = Path(PySide6.__file__).parent / "Qt" / "plugins"
    for path in plugins_dir.rglob("*"):
        flags = path.lstat().st_flags
        if flags & stat.UF_HIDDEN:
            os.chflags(path, flags & ~stat.UF_HIDDEN, follow_symlinks=False)


# Create the ghost, start the watcher thread, and run the Qt event loop
def main() -> None:
    unhide_qt_plugins()

    # Let Ctrl+C in the terminal quit the app
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    # Connect background events to the ghost's update methods
    bridge = Bridge()
    ghost = GhostWindow(WATCH_DIR.name)
    bridge.checked.connect(ghost.show_result)
    bridge.deleted.connect(ghost.remove_file)
    bridge.ai_chunk.connect(ghost.add_suggestion)
    bridge.ai_done.connect(ghost.finish_suggestion)

    # Each check gets an id so suggestions for outdated errors can be ignored
    request_ids = itertools.count(1)

    # Stream Gemma's suggestion to the ghost; runs on its own thread so checks stay instant
    def ask_ai(request_id: int, name: Path, before: str, after: str, output: str) -> None:
        try:
            explain_error(
                str(name),
                before,
                after,
                output,
                on_chunk=lambda text: bridge.ai_chunk.emit(request_id, text),
            )
            bridge.ai_done.emit(request_id, "")
        except OpenAIError as error:
            bridge.ai_done.emit(request_id, str(error))

    # Called by the watcher after every check: update the ghost, and ask AI on errors
    def on_result(name: Path, passed: bool, output: str, before: str, after: str) -> None:
        request_id = next(request_ids)
        bridge.checked.emit(str(name), passed, output, after, request_id)
        if not passed:
            threading.Thread(
                target=ask_ai,
                args=(request_id, name, before, after, output),
                daemon=True,
            ).start()

    # Watch files on a background thread so the window stays responsive
    stop_event = threading.Event()
    threading.Thread(
        target=watch_and_check,
        args=(on_result, lambda name: bridge.deleted.emit(str(name)), stop_event),
        daemon=True,
    ).start()
    app.aboutToQuit.connect(stop_event.set)

    ghost.show()
    sys.exit(app.exec())


# Run the desktop app when this file is executed directly
if __name__ == "__main__":
    main()
