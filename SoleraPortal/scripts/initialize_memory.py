from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
from pathlib import Path
import re


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"
TASKS_DIR = MEMORY / "tasks"
ARTIFACTS_DIR = MEMORY / "artifacts"

SKIP_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    KIT.name,
    ".obsidian",
}


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-") or "repo"


def list_project_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        files.append(path)
    return files


def detect_stack(files: list[Path]) -> list[str]:
    names = [path.name.lower() for path in files]
    hints: list[str] = []

    if "manage.py" in names or "requirements.txt" in names or "pyproject.toml" in names:
        hints.append("Python")
    if "package.json" in names:
        hints.append("Node.js")
    if "docker-compose.yml" in names:
        hints.append("Docker Compose")
    if any(name.endswith(".vue") for name in names):
        hints.append("Vue")
    if "manage.py" in names:
        hints.append("Django")
    if "vite.config.js" in names:
        hints.append("Vite")

    return sorted(dict.fromkeys(hints))


def summarize_repo(files: list[Path]) -> dict[str, object]:
    top_dirs = Counter(
        (path.relative_to(ROOT).parts[0] if len(path.relative_to(ROOT).parts) > 1 else "(root)")
        for path in files
    )
    extensions = Counter(path.suffix.lower() or "(no extension)" for path in files)
    return {
        "file_count": len(files),
        "top_dirs": top_dirs.most_common(10),
        "extensions": extensions.most_common(10),
        "stack": detect_stack(files),
    }


def build_artifact(summary: dict[str, object]) -> str:
    lines = [
        "# Baseline Repo Review",
        "",
        "## Summary",
        "",
        f"- Files observed: {summary['file_count']}",
        f"- Likely stack: {', '.join(summary['stack']) if summary['stack'] else 'unknown'}",
        "",
        "## Top-Level Areas",
        "",
    ]
    lines.extend(f"- {name}: {count} files" for name, count in summary["top_dirs"])
    lines.extend(["", "## Dominant File Types", ""])
    lines.extend(f"- {name}: {count}" for name, count in summary["extensions"])
    lines.extend(
        [
            "",
            "## Initialization Notes",
            "",
            "- This artifact is a baseline understanding for an existing repository.",
            "- Review current architecture, active work, and risks before treating the memory system as initialized.",
            "",
        ]
    )
    return "\n".join(lines)


def write_task_bundle(summary: dict[str, object]) -> Path:
    now = datetime.now().astimezone()
    task_dir = TASKS_DIR / f"{now.strftime('%Y-%m-%d')}-initialize-existing-repository-memory"
    task_dir.mkdir(parents=True, exist_ok=True)

    (task_dir / "task.md").write_text(
        "\n".join(
            [
                "# Task: Initialize Existing Repository Memory",
                "",
                "## Status",
                "",
                "Completed",
                "",
                "## Request",
                "",
                "Perform a first-pass review of an existing repository and create the initial operational memory baseline.",
                "",
                "## Scope",
                "",
                "- Detect whether the repo already contains code/data/docs",
                "- Summarize the current shape of the repository",
                "- Create a baseline artifact and initial state anchors",
                "",
                "## Relevant Prior Context",
                "",
                "- None; this is the initialization baseline",
                "",
                "## Changed Areas",
                "",
                "- Initial state baseline",
                "- Baseline repo review artifact",
                "",
                "## Key Decisions",
                "",
                "- Existing repo memory should be initialized from observed code/data state, not assumed greenfield",
                "",
                "## Risks",
                "",
                "- Baseline summary is heuristic and may miss nuanced project intent",
                "",
                "## Validation Performed",
                "",
                f"- Observed {summary['file_count']} project files outside ignored/system directories",
                "",
                "## Validation Still Needed",
                "",
                "- Human or later-agent review of actual current milestone and active work",
                "",
                "## Regression Notes",
                "",
                "- If initialization is skipped, later agents will waste tokens rediscovering project state",
                "",
                "## Outcome",
                "",
                "Created an initial baseline repo review artifact for routing future work.",
                "",
                "## Links",
                "",
                "- [Raw Intake](raw-intake.md)",
                "- [Sources](sources.md)",
                "- [Implementation](implementation.md)",
                "- [Baseline Repo Review](../../artifacts/baseline-repo-review.md)",
                "",
                "## Follow-Up",
                "",
                "- Refine `kit/memory/state.md` with actual current objective and risks after a deeper review",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (task_dir / "raw-intake.md").write_text(
        "# Raw Intake\n\n## User Intent\n\nInitialize memory for an existing repository so future agents start from observed project reality.\n\n## Requirements Captured\n\n- Detect whether existing code or data already exists\n- Build baseline state before substantial work\n\n## Approval Notes\n\n- Initialization generated by explicit repo-baseline workflow\n",
        encoding="utf-8",
    )
    (task_dir / "sources.md").write_text(
        "# Sources\n\n## Approved Context Used\n\n- Existing repository files and structure\n\n## External Sources\n\n- None\n\n## Related Raw Files\n\n- None\n",
        encoding="utf-8",
    )
    (task_dir / "implementation.md").write_text(
        "# Implementation: Initialize Existing Repository Memory\n\n## Goal\n\nCreate a first-pass operational baseline for an existing repository.\n\n## Context Used\n\n- Repository filesystem scan\n- [Baseline Repo Review](../../artifacts/baseline-repo-review.md)\n\n## Changes\n\n- Generated baseline artifact\n- Created initialization task bundle\n\n## Breakage Risks\n\n- Heuristic repo summaries may not capture business intent or active branch history\n\n## Validation\n\n"
        f"- Counted {summary['file_count']} project files after excluding memory/runtime/system paths\n\n"
        "## Follow-Up\n\n- Perform a deeper human/agent review to refine state and domains\n",
        encoding="utf-8",
    )
    return task_dir


def update_state(summary: dict[str, object], task_dir: Path) -> None:
    state_path = MEMORY / "state.md"
    stack = ", ".join(summary["stack"]) if summary["stack"] else "unknown"
    state_path.write_text(
        "\n".join(
            [
                "# Project State",
                "",
                "## Current Objective",
                "",
                "Baseline initialization completed for an existing repository. Refine this page after a deeper review of actual active work.",
                "",
                "## Active Plan",
                "",
                "- Review the baseline artifact",
                "- Confirm the real current milestone and active work",
                "- Add domain pages and decisions as the architecture becomes clearer",
                "",
                "## Recent Progress",
                "",
                f"- Existing repository baseline captured with likely stack: {stack}",
                "",
                "## Areas In Flux",
                "",
                "- Actual product objective may still need confirmation",
                "- Active risks and validation coverage may still be incomplete",
                "",
                "## Active Risks",
                "",
                "- Baseline state is heuristic until reviewed against actual project goals",
                "- Existing regressions or unstable areas may not yet be captured",
                "",
                "## Open Blockers",
                "",
                "- No deeper project review has been completed yet",
                "",
                "## Critical Invariants",
                "",
                "- Existing repos must be initialized from observed reality before substantial work",
                "- Future agents should review the baseline artifact and initialization task first",
                "",
                "## Next Recommended Actions",
                "",
                "- Read [Baseline Repo Review](artifacts/baseline-repo-review.md)",
                f"- Read [Initialization Task](tasks/{task_dir.name}/task.md)",
                "- Update this page with the real current milestone after the first deeper review",
                "",
            ]
        ),
        encoding="utf-8",
    )


def update_index(task_dir: Path) -> None:
    index_path = MEMORY / "index.md"
    if not index_path.exists():
        return
    content = index_path.read_text(encoding="utf-8")
    placeholder = "- No substantial work recorded yet"
    replacement = f"- [{task_dir.name}](tasks/{task_dir.name}/task.md)"
    if placeholder in content:
        content = content.replace(placeholder, replacement)
    elif replacement not in content:
        content += f"\n{replacement}\n"
    index_path.write_text(content, encoding="utf-8")


def append_log(task_dir: Path) -> None:
    log_path = MEMORY / "log.md"
    timestamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    entry = "\n".join(
        [
            f"### {timestamp}",
            "",
            f"- Task: [{task_dir.name}](tasks/{task_dir.name}/task.md)",
            "- Request: Initialize memory for an existing repository from observed code/data state",
            "- Approval: Generated by explicit existing-repo initialization workflow",
            "- Key decisions:",
            "  - Create a baseline repo review before substantial work",
            "  - Replace greenfield assumptions with observed repo structure",
            "- Linked files:",
            "  - [Baseline Repo Review](artifacts/baseline-repo-review.md)",
            "",
        ]
    )
    if not log_path.exists():
        log_path.write_text("# Memory Log\n\nChronological ledger of substantial work.\n\n## Entries\n\n", encoding="utf-8")
    content = log_path.read_text(encoding="utf-8").rstrip()
    if task_dir.name not in content:
        content = content + "\n\n" + entry + "\n"
        log_path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize operational memory for an existing repository.")
    parser.add_argument("--write", action="store_true", help="Write baseline artifact, task bundle, and state update")
    args = parser.parse_args()

    files = list_project_files(ROOT)
    summary = summarize_repo(files)
    artifact = build_artifact(summary)
    print(artifact)

    if not args.write:
        return

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACTS_DIR / "baseline-repo-review.md"
    artifact_path.write_text(artifact, encoding="utf-8")
    task_dir = write_task_bundle(summary)
    update_state(summary, task_dir)
    update_index(task_dir)
    append_log(task_dir)
    print(f"Wrote {artifact_path.relative_to(ROOT)}")
    print(f"Wrote {task_dir.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
