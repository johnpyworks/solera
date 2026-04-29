from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"
STATE_FILE = KIT / "scripts" / "runtime" / "lint_state.json"


def list_markdown_files() -> list[Path]:
    return sorted(path for path in MEMORY.rglob("*.md") if "templates" not in path.parts)


def extract_links(content: str) -> list[str]:
    return re.findall(r"\[[^\]]+\]\(([^)]+)\)", content)


def check_broken_relative_links() -> list[str]:
    issues = []
    for path in list_markdown_files():
        content = path.read_text(encoding="utf-8")
        for link in extract_links(content):
            if link.startswith("http://") or link.startswith("https://"):
                continue
            target = (path.parent / link).resolve()
            if not target.exists():
                issues.append(f"broken-link: {path.relative_to(ROOT)} -> {link}")
    return issues


def check_missing_state() -> list[str]:
    issues = []
    state_path = MEMORY / "state.md"
    if not state_path.exists():
        issues.append("missing-state: kit/memory/state.md does not exist")
    return issues


def check_tasks_missing_validation() -> list[str]:
    issues = []
    for task_file in (MEMORY / "tasks").rglob("task.md"):
        content = task_file.read_text(encoding="utf-8")
        if "## Validation Performed" not in content:
            issues.append(f"missing-validation: {task_file.relative_to(ROOT)}")
        if "## Changed Areas" not in content:
            issues.append(f"missing-changed-areas: {task_file.relative_to(ROOT)}")
    return issues


def check_domains_missing_invariants() -> list[str]:
    issues = []
    for domain_file in (MEMORY / "domains").glob("*.md"):
        content = domain_file.read_text(encoding="utf-8")
        if "## Core Invariants" not in content:
            issues.append(f"missing-invariants: {domain_file.relative_to(ROOT)}")
        if "## Validation Checklist" not in content:
            issues.append(f"missing-domain-validation: {domain_file.relative_to(ROOT)}")
        if "## Lessons Learned" not in content:
            issues.append(f"missing-lessons: {domain_file.relative_to(ROOT)}")
    return issues


def save_runtime_state(issues: list[str]) -> None:
    payload = {
        "last_lint_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "issue_count": len(issues),
    }
    STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run lightweight structural lint for kit/memory/")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any issue is found")
    args = parser.parse_args()

    issues: list[str] = []
    issues.extend(check_missing_state())
    issues.extend(check_broken_relative_links())
    issues.extend(check_tasks_missing_validation())
    issues.extend(check_domains_missing_invariants())
    save_runtime_state(issues)

    if issues:
        print("Memory lint issues:")
        for issue in issues:
            print(f"- {issue}")
    else:
        print("Memory lint passed.")

    if args.strict and issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
