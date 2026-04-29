from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import re


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
SESSIONS_DIR = KIT / "memory" / "sessions"
INDEX_FILE = SESSIONS_DIR / "index.md"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-") or "session"


def update_index(filename: str, title: str) -> None:
    entry = f"- [{title}]({filename})"
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text(
            "# Session Index\n\nSession notes are raw promotion sources, not durable truth by default.\n\n## Recent Sessions\n\n",
            encoding="utf-8",
        )

    content = INDEX_FILE.read_text(encoding="utf-8")
    if entry not in content:
        updated = content.rstrip() + f"\n{entry}\n"
        INDEX_FILE.write_text(updated, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture a session note into kit/memory/sessions/")
    parser.add_argument("title", help="Short session title")
    parser.add_argument("--context", default="", help="One-paragraph session context")
    parser.add_argument(
        "--takeaway",
        action="append",
        default=[],
        help="Repeatable key takeaway bullet",
    )
    parser.add_argument(
        "--promote-to",
        action="append",
        default=[],
        help="Repeatable promotion target path or label",
    )
    parser.add_argument(
        "--follow-up",
        action="append",
        default=[],
        help="Repeatable follow-up bullet",
    )
    args = parser.parse_args()

    now = datetime.now().astimezone()
    filename = f"{now.strftime('%Y-%m-%d-%H%M')}-{slugify(args.title)}.md"
    title = f"Session: {args.title}"
    path = SESSIONS_DIR / filename

    takeaways = args.takeaway or ["<add key takeaway>"]
    promote_to = args.promote_to or ["<add promotion target>"]
    follow_up = args.follow_up or ["<add follow-up>"]

    body = "\n".join(
        [
            f"# {title}",
            "",
            "## Status",
            "",
            "Captured",
            "",
            "## Context",
            "",
            args.context or "<add session context>",
            "",
            "## Key Takeaways",
            "",
            *[f"- {item}" for item in takeaways],
            "",
            "## Promotion Targets",
            "",
            *[f"- {item}" for item in promote_to],
            "",
            "## Follow-Up",
            "",
            *[f"- {item}" for item in follow_up],
            "",
        ]
    )

    path.write_text(body, encoding="utf-8")
    update_index(filename, title)
    print(path)


if __name__ == "__main__":
    main()
