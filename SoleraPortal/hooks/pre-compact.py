from __future__ import annotations

from pathlib import Path

from common import (
    create_session_note,
    load_hook_payload,
    load_runtime_state,
    read_transcript_excerpt,
    save_runtime_state,
)


def main() -> None:
    payload = load_hook_payload()
    transcript_path_raw = payload.get("transcript_path") or payload.get("transcriptPath") or ""
    session_id = str(payload.get("session_id") or payload.get("sessionId") or "unknown-session")
    cwd = str(payload.get("cwd") or "")
    transcript_path = Path(transcript_path_raw) if transcript_path_raw else Path("")

    if not transcript_path_raw:
        return

    state = load_runtime_state()
    dedup_key = f"pre-compact:{session_id}:{transcript_path}"
    if state.get("last_capture_key") == dedup_key:
        return

    users, assistants = read_transcript_excerpt(transcript_path, max_messages=8)

    takeaways: list[str] = []
    if users:
        takeaways.append(f"Recent user context before compaction: {users[-1]}")
    if assistants:
        takeaways.append(f"Recent assistant context before compaction: {assistants[-1]}")
    if not takeaways:
        takeaways.append("Pre-compact fired, but transcript content was not available.")

    follow_up = [
        "Review whether this pre-compact snapshot should inform the active task",
        "Promote any important rationale if context may be lost after compaction",
    ]

    context = (
        "Auto-captured before context compaction. "
        f"Session id: `{session_id}`. "
        f"CWD: `{cwd or 'unknown'}`."
    )

    create_session_note(
        title=f"pre-compact-{session_id}",
        context=context,
        takeaways=takeaways,
        follow_up=follow_up,
        event_name="PreCompact",
    )

    state["last_capture_key"] = dedup_key
    save_runtime_state(state)


if __name__ == "__main__":
    main()
