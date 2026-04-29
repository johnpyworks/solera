from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import re
from typing import Any


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"
SESSIONS_DIR = MEMORY / "sessions"
RUNTIME_DIR = KIT / "scripts" / "runtime"
HOOK_STATE = RUNTIME_DIR / "hook_state.json"


def load_hook_payload() -> dict[str, Any]:
    try:
        raw = input()
    except EOFError:
        return {}
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-") or "session"


def extract_text(block: Any) -> str:
    if isinstance(block, str):
        return block.strip()
    if isinstance(block, dict):
        if block.get("type") == "text":
            return str(block.get("text", "")).strip()
        return str(block.get("text", "")).strip()
    if isinstance(block, list):
        return "\n".join(part for part in (extract_text(item) for item in block) if part)
    return ""


def read_transcript_excerpt(transcript_path: Path, max_messages: int = 12) -> tuple[list[str], list[str]]:
    if not transcript_path.exists():
        return [], []

    user_lines: list[str] = []
    assistant_lines: list[str] = []

    with transcript_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                entry = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            message = entry.get("message", entry)
            role = str(message.get("role", "")).lower()
            content = extract_text(message.get("content", ""))
            if not content:
                continue

            compact = " ".join(content.split())
            compact = compact[:400]

            if role == "user":
                user_lines.append(compact)
            elif role == "assistant":
                assistant_lines.append(compact)

    return user_lines[-max_messages:], assistant_lines[-max_messages:]


def load_runtime_state() -> dict[str, Any]:
    if not HOOK_STATE.exists():
        return {}
    try:
        return json.loads(HOOK_STATE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_runtime_state(state: dict[str, Any]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    HOOK_STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def session_note_filename(title: str) -> str:
    now = datetime.now().astimezone()
    return f"{now.strftime('%Y-%m-%d-%H%M')}-{slugify(title)}.md"


def update_session_index(filename: str, title: str) -> None:
    index_file = SESSIONS_DIR / "index.md"
    entry = f"- [{title}]({filename})"
    if not index_file.exists():
        index_file.write_text(
            "# Session Index\n\nSession notes are raw promotion sources, not durable truth by default.\n\n## Recent Sessions\n\n",
            encoding="utf-8",
        )
    content = index_file.read_text(encoding="utf-8")
    if entry not in content:
        index_file.write_text(content.rstrip() + f"\n{entry}\n", encoding="utf-8")


def create_session_note(
    *,
    title: str,
    context: str,
    takeaways: list[str],
    follow_up: list[str],
    event_name: str,
) -> Path:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    filename = session_note_filename(title)
    path = SESSIONS_DIR / filename
    full_title = f"Session: {title}"

    body = "\n".join(
        [
            f"# {full_title}",
            "",
            "## Status",
            "",
            "Captured",
            "",
            "## Context",
            "",
            context,
            "",
            "## Key Takeaways",
            "",
            *[f"- {item}" for item in takeaways],
            "",
            "## Promotion Targets",
            "",
            "- [Project State](../state.md)",
            "- Review the active task and relevant domain pages before promotion",
            "",
            "## Follow-Up",
            "",
            *[f"- {item}" for item in follow_up],
            "",
            "## Capture Metadata",
            "",
            f"- Hook: `{event_name}`",
            f"- Captured At: `{datetime.now().astimezone().isoformat(timespec='seconds')}`",
            "",
        ]
    )

    path.write_text(body, encoding="utf-8")
    update_session_index(filename, full_title)
    return path
