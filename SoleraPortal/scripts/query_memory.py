from __future__ import annotations

import argparse
from pathlib import Path
import re


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"

ROUTING_FILES = [
    MEMORY / "state.md",
    MEMORY / "index.md",
    MEMORY / "log.md",
]

SEARCH_DIRS = [
    MEMORY / "domains",
    MEMORY / "tasks",
    MEMORY / "decisions",
    MEMORY / "artifacts",
    MEMORY / "sessions",
]


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_-]{3,}", text.lower()))


def memory_initialized() -> bool:
    state_path = MEMORY / "state.md"
    index_path = MEMORY / "index.md"
    if not state_path.exists() or not index_path.exists():
        return False
    state_text = state_path.read_text(encoding="utf-8")
    return "Pending baseline" not in state_text


def score_file(path: Path, query_tokens: set[str]) -> int:
    try:
        content = path.read_text(encoding="utf-8").lower()
    except OSError:
        return 0
    return sum(content.count(token) for token in query_tokens)


def main() -> None:
    parser = argparse.ArgumentParser(description="Route a question to relevant memory files.")
    parser.add_argument("question", help="Question or task prompt")
    parser.add_argument("--top", type=int, default=8, help="Number of suggested files")
    args = parser.parse_args()

    if not memory_initialized():
        print("Memory is not initialized for this repository.")
        print("Run: python kit\\scripts\\initialize_memory.py --write")
        return

    query_tokens = tokenize(args.question)
    candidates: list[tuple[int, Path]] = []

    for path in ROUTING_FILES:
        if path.exists():
            candidates.append((1000 - ROUTING_FILES.index(path) * 10, path))

    for search_dir in SEARCH_DIRS:
        if not search_dir.exists():
            continue
        for path in search_dir.rglob("*.md"):
            if path.name == "index.md":
                continue
            score = score_file(path, query_tokens)
            if score > 0:
                candidates.append((score, path))

    unique: dict[Path, int] = {}
    for score, path in candidates:
        unique[path] = max(score, unique.get(path, 0))

    ranked = sorted(unique.items(), key=lambda item: (-item[1], str(item[0])))

    print(f"Question: {args.question}")
    print("Suggested read order:")
    for path, score in ranked[: args.top]:
        print(f"- {path.relative_to(ROOT)} (score={score})")


if __name__ == "__main__":
    main()
