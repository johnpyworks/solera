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

    state = load_runtime_state()
    dedup_key = f"session-end:{session_id}:{transcript_path}"
    if state.get("last_capture_key") == dedup_key:
        return

    users, assistants = read_transcript_excerpt(transcript_path)

    takeaways: list[str] = []
    if users:
        takeaways.append(f"Recent user intent: {users[-1]}")
    if assistants:
        takeaways.append(f"Recent assistant output: {assistants[-1]}")
    if not takeaways:
        takeaways.append("Session ended, but no transcript content was available for summarization.")

    follow_up = [
        "Review whether any rationale or discoveries should be promoted into the active task",
        "Review whether project state or domain invariants changed during this session",
    ]

    context = (
        "Auto-captured at session end. "
        f"Session id: `{session_id}`. "
        f"CWD: `{cwd or 'unknown'}`."
    )

    create_session_note(
        title=f"session-end-{session_id}",
        context=context,
        takeaways=takeaways,
        follow_up=follow_up,
        event_name="SessionEnd",
    )

    state["last_capture_key"] = dedup_key
    save_runtime_state(state)


if __name__ == "__main__":
    main()
