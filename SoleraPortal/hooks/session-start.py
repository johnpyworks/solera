from __future__ import annotations

import json
from pathlib import Path


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"
MAX_CONTEXT_CHARS = 20000


def read_text(path: Path, fallback: str = "") -> str:
    if not path.exists():
        return fallback
    return path.read_text(encoding="utf-8")


def memory_initialized() -> bool:
    state_path = MEMORY / "state.md"
    index_path = MEMORY / "index.md"
    if not state_path.exists() or not index_path.exists():
        return False
    return "Pending baseline" not in state_path.read_text(encoding="utf-8")


def latest_session_excerpt() -> str:
    sessions_dir = MEMORY / "sessions"
    if not sessions_dir.exists():
        return "(no sessions captured yet)"

    sessions = sorted(
        [path for path in sessions_dir.glob("*.md") if path.name != "index.md"],
        reverse=True,
    )
    if not sessions:
        return "(no sessions captured yet)"

    content = sessions[0].read_text(encoding="utf-8").splitlines()
    excerpt = "\n".join(content[:30])
    return excerpt


def build_context() -> str:
    if not memory_initialized():
        return (
            "Memory is not initialized for this repository yet.\n\n"
            "Before substantial work, inspect the existing code/data shape and create a baseline state.\n"
            "Suggested command: `python kit\\scripts\\initialize_memory.py --write`"
        )

    parts = [
        "## Routing\n\n" + read_text(MEMORY / "index.md", "(missing index)"),
        "## Current State\n\n" + read_text(MEMORY / "state.md", "(missing state)"),
        "## Recent Log\n\n" + read_text(MEMORY / "log.md", "(missing log)"),
        "## Latest Session\n\n" + latest_session_excerpt(),
    ]
    context = "\n\n---\n\n".join(parts)
    if len(context) > MAX_CONTEXT_CHARS:
        context = context[:MAX_CONTEXT_CHARS] + "\n\n...(truncated)"
    return context


def main() -> None:
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": build_context(),
        }
    }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
