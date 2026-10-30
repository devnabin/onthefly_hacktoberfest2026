"""Ask a local Gemma model (via Ollama) to explain why a save broke the code."""

import difflib
from collections.abc import Callable

from openai import OpenAI

# Local Ollama server, using its OpenAI-compatible API
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",  # Required by the SDK, but ignored by Ollama
)

# Model to use; must be pulled in Ollama (`ollama list`)
MODEL = "gemma4:12b-mlx"

# Instructions that shape how the model answers
SYSTEM_PROMPT = """You are a friendly senior developer helping a teammate debug.
You get the last working version of a file, the new broken version, a diff
between them, and the error from the compiler/linter.
Respond with:
1. What went wrong, in plain language.
2. The exact line(s) in the new version that cause it, and why.
3. The fixed code for those lines.
4. A short tip to avoid this mistake next time.
Be specific and concise. Base your answer on the code and error given.

At the very end, for every line you change, add one line in exactly this format
(plain text, not in a code block, nothing after them):
FIX: <line number> | <the corrected line, with its original indentation>"""


# Build a unified diff so the model can see exactly what the save changed
def make_diff(filename: str, before: str, after: str) -> str:
    return "".join(
        difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=f"{filename} (working)",
            tofile=f"{filename} (broken)",
        )
    )


# Print a piece of the answer to the terminal as soon as it arrives
def print_chunk(text: str) -> None:
    print(text, end="", flush=True)


# Send both versions plus the error to Gemma and stream its answer to on_chunk
def explain_error(
    filename: str,
    before: str,
    after: str,
    error: str,
    on_chunk: Callable[[str], None] = print_chunk,
    model: str = MODEL,
) -> str:
    # Put everything the model needs into one message
    user_prompt = f"""File: {filename}

--- Last working version ---
{before}

--- New broken version ---
{after}

--- Diff ---
{make_diff(filename, before, after) or "(no diff available)"}

--- Error ---
{error}"""

    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        stream=True,
    )

    # Pass each chunk on as it arrives and collect the full answer
    parts = []
    for chunk in stream:
        text = chunk.choices[0].delta.content or "" if chunk.choices else ""
        if text:
            on_chunk(text)
            parts.append(text)
    on_chunk("\n")
    return "".join(parts)
