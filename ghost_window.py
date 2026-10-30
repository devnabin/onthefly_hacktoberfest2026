"""Floating ghost circle that shows check results and opens a suggestion panel."""

import random

from PySide6.QtCore import QPoint, QSettings, QSize, Qt, Slot
from PySide6.QtGui import QActionGroup, QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMenu,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from watcher import find_error_lines

# Size of the collapsed circle and the expanded panel
CIRCLE_SIZE = 72
PANEL_SIZE = QSize(420, 360)

# Gap between the circle and the screen edge on first launch
SCREEN_MARGIN = 24

# Fill and border colors for each state
FILL_COLORS = {"idle": "#ffffff", "clean": "#22c55e", "error": "#ef4444"}
BORDER_COLORS = {"idle": "#a1a1aa", "clean": "#15803d", "error": "#b91c1c"}

# Panel background (close to VS Code's dark theme)
PANEL_BACKGROUND = "#1e1e2e"

# Shown when the user clicks a green ghost
MOTIVATION = [
    "You are clean, keep coding, keep focus! 🚀",
    "No bugs in sight. Stay in the flow! 🌊",
    "Clean code, clear mind. Keep going! 💪",
    "Zero errors. The ghost is proud of you! 👻",
    "All checks passed. Ship it (after tests)! 🛳️",
]

# What the error panel can show; picked from the ⚙ menu and remembered between runs
VIEW_MODES = {
    "default": "Default (error + AI suggestion)",
    "error": "Error message only",
    "suggestion": "AI suggestion only",
    "line": "Error line only",
    "line_suggestion": "Error line + AI suggestion",
}
DEFAULT_VIEW_MODE = "default"

# Styles for the widgets inside the expanded panel
PANEL_STYLE = """
QLabel#title { color: #f4f4f5; font-size: 15px; font-weight: 600; }
QTextBrowser { background: transparent; border: none; color: #e4e4e7; font-size: 13px; }
QPushButton#icon { color: #a1a1aa; background: transparent; border: none; font-size: 16px; padding: 0 4px; }
QPushButton#icon:hover { color: #ffffff; }
QScrollBar { background: transparent; width: 8px; height: 8px; }
QScrollBar::handle { background: #52525b; border-radius: 4px; min-height: 24px; min-width: 24px; }
QScrollBar::add-line, QScrollBar::sub-line { width: 0; height: 0; }
QScrollBar::add-page, QScrollBar::sub-page { background: transparent; }
"""


# Frameless, always-on-top window: a colored circle that expands into a panel on click
class GhostWindow(QWidget):
    def __init__(self, watch_dir_name: str) -> None:
        # Tool window: no Dock/taskbar entry, floats above other apps like VS Code
        super().__init__(
            None,
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool,
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        # Keep showing on macOS when another app (VS Code) has focus
        self.setAttribute(Qt.WidgetAttribute.WA_MacAlwaysShowToolWindow)
        # Don't steal keyboard focus from the editor
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)

        # What the ghost knows: whether anything was checked, and every file with an error.
        # errors maps file name -> output, suggestion, request_id, status, ai_error
        self.watch_dir_name = watch_dir_name
        self.checked_any = False
        self.errors: dict[str, dict] = {}
        self.motivation = random.choice(MOTIVATION)

        # Saved user setting for what the error panel shows
        self.settings = QSettings("onthefly", "CodeGhost")
        self.view_mode = self.settings.value("view_mode", DEFAULT_VIEW_MODE)
        if self.view_mode not in VIEW_MODES:
            self.view_mode = DEFAULT_VIEW_MODE

        # Window mode and drag tracking
        self.expanded = False
        self.circle_pos: QPoint | None = None
        self.press_pos: QPoint | None = None
        self.window_start = QPoint()
        self.dragging = False

        self.build_panel()
        self.collapse()

        # Start in the bottom-right corner of the screen
        screen = self.screen().availableGeometry()
        self.circle_pos = QPoint(
            screen.right() - CIRCLE_SIZE - SCREEN_MARGIN,
            screen.bottom() - CIRCLE_SIZE - SCREEN_MARGIN,
        )
        self.move(self.circle_pos)

    # Create the panel shown when expanded: a title row and a scrollable text area
    def build_panel(self) -> None:
        self.panel = QWidget(self)
        self.panel.setStyleSheet(PANEL_STYLE)

        self.title = QLabel(objectName="title")
        settings_button = QPushButton("⚙", objectName="icon")
        settings_button.setToolTip("Choose what the panel shows")
        settings_button.setCursor(Qt.CursorShape.PointingHandCursor)
        settings_button.clicked.connect(lambda: self.show_settings_menu(settings_button))

        close_button = QPushButton("✕", objectName="icon")
        close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        close_button.clicked.connect(self.collapse)

        header = QHBoxLayout()
        header.addWidget(self.title, 1)
        header.addWidget(settings_button)
        header.addWidget(close_button)

        self.body = QTextBrowser()
        self.body.setOpenExternalLinks(True)

        layout = QVBoxLayout(self.panel)
        layout.setContentsMargins(18, 14, 14, 16)
        layout.addLayout(header)
        layout.addWidget(self.body, 1)
        self.panel.hide()

    # Current color state: red if any file has an error, green once checks pass, else white
    def state(self) -> str:
        if self.errors:
            return "error"
        return "clean" if self.checked_any else "idle"

    # Turn the circle into the suggestion panel, opening toward the middle of the screen
    def expand(self) -> None:
        self.circle_pos = self.pos()
        self.expanded = True
        self.setFixedSize(PANEL_SIZE)
        self.move(self.panel_position())
        self.panel.setGeometry(0, 0, PANEL_SIZE.width(), PANEL_SIZE.height())
        self.panel.show()
        self.refresh_panel()
        self.update()

    # Shrink back to the circle at its previous spot, with a fresh motivation line for next time
    def collapse(self) -> None:
        self.motivation = random.choice(MOTIVATION)
        self.expanded = False
        self.panel.hide()
        self.setFixedSize(CIRCLE_SIZE, CIRCLE_SIZE)
        if self.circle_pos is not None:
            self.move(self.circle_pos)
        self.update()

    # Anchor the panel to the circle's corner nearest the screen edge, kept fully on screen
    def panel_position(self) -> QPoint:
        screen = self.screen().availableGeometry()
        center = self.circle_pos + QPoint(CIRCLE_SIZE // 2, CIRCLE_SIZE // 2)

        x = self.circle_pos.x()
        if center.x() > screen.center().x():
            x += CIRCLE_SIZE - PANEL_SIZE.width()
        y = self.circle_pos.y()
        if center.y() > screen.center().y():
            y += CIRCLE_SIZE - PANEL_SIZE.height()

        x = max(screen.left(), min(x, screen.right() - PANEL_SIZE.width()))
        y = max(screen.top(), min(y, screen.bottom() - PANEL_SIZE.height()))
        return QPoint(x, y)

    # Fill the panel with the error + AI suggestion, a motivation line, or the idle message
    def refresh_panel(self) -> None:
        if not self.expanded:
            return

        state = self.state()
        if state == "error":
            # Show the most recently failed file
            name, entry = list(self.errors.items())[-1]
            self.title.setText(f"❌ Error in {name}")
            markdown = self.error_markdown(entry)

            # Mention any other broken files
            others = [other for other in self.errors if other != name]
            if others:
                markdown += "\n\n---\n\nAlso failing: " + ", ".join(others)
        elif state == "clean":
            self.title.setText("✅ All clean")
            markdown = f"### {self.motivation}"
        else:
            self.title.setText("👻 Watching")
            markdown = f"Watching **{self.watch_dir_name}** … save a file to check it."

        # Keep the reader's scroll position while the suggestion streams in
        scroll = self.body.verticalScrollBar().value()
        self.body.setMarkdown(markdown)
        self.body.verticalScrollBar().setValue(scroll)

    # Build the error panel text for the selected view mode
    def error_markdown(self, entry: dict) -> str:
        sections = {
            "default": ["error", "suggestion"],
            "error": ["error"],
            "suggestion": ["suggestion"],
            "line": ["line"],
            "line_suggestion": ["line", "suggestion"],
        }[self.view_mode]

        parts = []
        if "error" in sections:
            parts.append(f"**Error**\n\n```text\n{entry['output'].strip()}\n```")
        if "line" in sections:
            parts.append(self.error_lines_markdown(entry))
        if "suggestion" in sections:
            parts.append(self.suggestion_markdown(entry))
        return "\n\n".join(parts)

    # The broken line(s) of code, each followed by its error messages
    def error_lines_markdown(self, entry: dict) -> str:
        found = find_error_lines(entry["output"])
        if not found:
            # Couldn't read a line number, so fall back to the raw error
            return f"**Error**\n\n```text\n{entry['output'].strip()}\n```"

        # Group messages by line so a line with two problems is shown once
        messages_by_line: dict[int, list[str]] = {}
        for line_number, message in found:
            messages_by_line.setdefault(line_number, []).append(message)

        code_lines = entry["code"].splitlines()
        parts = []
        for line_number, messages in sorted(messages_by_line.items()):
            code = code_lines[line_number - 1] if line_number <= len(code_lines) else ""
            bullets = "\n".join(f"- {message}" for message in messages)
            parts.append(f"**Line {line_number}**\n\n```text\n{line_number} | {code}\n```\n\n{bullets}")
        return "\n\n".join(parts)

    # Gemma's answer so far, or a status note while it's working / if it failed
    def suggestion_markdown(self, entry: dict) -> str:
        markdown = "**🤖 Suggestion**\n\n"
        if entry["suggestion"]:
            markdown += entry["suggestion"]
        elif entry["status"] == "thinking":
            markdown += "_Gemma is thinking…_"
        if entry["status"] == "failed":
            markdown += f"\n\n_AI explanation failed: {entry['ai_error']}_"
        return markdown

    # Show the ⚙ menu with one checkable entry per view mode
    def show_settings_menu(self, button: QPushButton) -> None:
        menu = QMenu(self)
        group = QActionGroup(menu)
        for mode, label in VIEW_MODES.items():
            action = menu.addAction(label)
            action.setCheckable(True)
            action.setChecked(mode == self.view_mode)
            action.triggered.connect(lambda _checked, mode=mode: self.set_view_mode(mode))
            group.addAction(action)
        menu.exec(button.mapToGlobal(button.rect().bottomLeft()))

    # Save the chosen view mode and redraw the panel with it
    def set_view_mode(self, mode: str) -> None:
        self.view_mode = mode
        self.settings.setValue("view_mode", mode)
        self.refresh_panel()

    # Find the error entry that an AI request belongs to (None if it's outdated)
    def entry_for_request(self, request_id: int) -> dict | None:
        for entry in self.errors.values():
            if entry["request_id"] == request_id:
                return entry
        return None

    # A file was checked: update the error list and the circle color
    @Slot(str, bool, str, str, int)
    def show_result(self, name: str, passed: bool, output: str, code: str, request_id: int) -> None:
        self.checked_any = True
        had_errors = bool(self.errors)

        # Re-insert failures so the newest one is shown first
        self.errors.pop(name, None)
        if not passed:
            self.errors[name] = {
                "output": output,
                "code": code,
                "suggestion": "",
                "request_id": request_id,
                "status": "thinking",
                "ai_error": "",
            }

        # Celebrate when the last error is fixed
        if had_errors and not self.errors:
            self.motivation = f"🎉 Fixed! {random.choice(MOTIVATION)}"

        self.update()
        self.refresh_panel()

    # Append a streamed piece of the AI suggestion
    @Slot(int, str)
    def add_suggestion(self, request_id: int, text: str) -> None:
        entry = self.entry_for_request(request_id)
        if entry:
            entry["suggestion"] += text
            self.refresh_panel()

    # The AI finished; ai_error is empty on success
    @Slot(int, str)
    def finish_suggestion(self, request_id: int, ai_error: str) -> None:
        entry = self.entry_for_request(request_id)
        if entry:
            entry["status"] = "failed" if ai_error else "done"
            entry["ai_error"] = ai_error
            self.refresh_panel()

    # A watched file was deleted, so its error no longer counts
    @Slot(str)
    def remove_file(self, name: str) -> None:
        self.errors.pop(name, None)
        self.update()
        self.refresh_panel()

    # Draw the colored circle with a ghost, or the panel's rounded background
    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        state = self.state()

        if self.expanded:
            painter.setPen(QPen(QColor(BORDER_COLORS[state]), 3))
            painter.setBrush(QColor(PANEL_BACKGROUND))
            painter.drawRoundedRect(self.rect().adjusted(2, 2, -2, -2), 14, 14)
            return

        circle = self.rect().adjusted(4, 4, -4, -4)
        painter.setPen(QPen(QColor(BORDER_COLORS[state]), 3))
        painter.setBrush(QColor(FILL_COLORS[state]))
        painter.drawEllipse(circle)
        painter.setFont(QFont(self.font().family(), 26))
        painter.drawText(circle, Qt.AlignmentFlag.AlignCenter, "👻")

    # Start a possible click or drag
    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.press_pos = event.globalPosition().toPoint()
            self.window_start = self.pos()
            self.dragging = False

    # Move the window once the mouse has moved far enough to count as a drag
    def mouseMoveEvent(self, event) -> None:
        if self.press_pos is None:
            return
        delta = event.globalPosition().toPoint() - self.press_pos
        if not self.dragging and delta.manhattanLength() >= QApplication.startDragDistance():
            self.dragging = True
        if self.dragging:
            self.move(self.window_start + delta)

    # A press without a drag is a click: open the panel
    def mouseReleaseEvent(self, event) -> None:
        if event.button() != Qt.MouseButton.LeftButton or self.press_pos is None:
            return
        self.press_pos = None

        if self.dragging:
            if not self.expanded:
                self.circle_pos = self.pos()
            return
        if not self.expanded:
            self.expand()

    # Right-click menu to quit the app
    def contextMenuEvent(self, event) -> None:
        menu = QMenu(self)
        menu.addAction("Quit", QApplication.quit)
        menu.exec(event.globalPos())
