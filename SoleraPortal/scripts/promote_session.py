from __future__ import annotations

import argparse
from pathlib import Path


KIT = Path(__file__).resolve().parent.parent
ROOT = KIT.parent
MEMORY = KIT / "memory"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a promotion checklist from a session note.")
    parser.add_argument("session_file", help="Path to a session note under kit/memory/sessions/")
    args = parser.parse_args()

    session_path = Path(args.session_file)
    if not session_path.is_absolute():
        session_path = ROOT / args.session_file

    if not session_path.exists():
        raise SystemExit(f"Session file not found: {session_path}")

    print(f"Promotion checklist for {session_path.relative_to(ROOT)}")
    print("- Review whether project state should change")
    print("- Review whether an active task should be updated")
    print("- Review whether a domain invariant or lesson learned should be updated")
    print("- Review whether a new decision record is needed")
    print("- Review whether the session should be cited from an artifact or task")


if __name__ == "__main__":
    main()
