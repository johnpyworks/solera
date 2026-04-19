"""Scribe Agent — transcript/notes → email drafts in ApprovalItem queue."""
import json
from datetime import date

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompt_store import (
    get_prompt,
    meeting_notes_user_prompt,
    action_items_user_prompt,
    next_meeting_user_prompt,
    memory_extraction_user_prompt,
)
from apps.approvals.models import ApprovalItem
from apps.clients.models import ClientMemory
from apps.meetings.models import Meeting
from apps.settings_app.models import AdvisorSettings


def _strip_code_fence(text: str) -> str:
    """Remove markdown ```json ... ``` fences if present."""
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text


def run(meeting_id: str) -> dict:
    """Main entry point. Returns counts of items created."""
    try:
        meeting = Meeting.objects.select_related("client", "owner").get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return {"error": f"Meeting {meeting_id} not found"}

    client = meeting.client
    settings = AdvisorSettings.get()
    ai = AIProvider()

    # Get meeting notes — prefer transcript, fall back to leap_notes
    notes = meeting.transcript_text or meeting.leap_notes_text
    if not notes:
        return {"error": "No transcript or notes to process"}

    # Load existing client memories for context
    existing_memories = {m.key: m.value for m in ClientMemory.objects.filter(client=client)}
    memory_context = ""
    if existing_memories:
        memory_context = "\n\nKnown client context:\n" + "\n".join(
            f"- {k}: {v}" for k, v in existing_memories.items()
        )

    # Build client context (last 3 notes)
    recent_notes = client.notes.order_by("-created_at")[:3]
    client_context = "\n".join(f"- {n.text}" for n in recent_notes) or "No prior notes."

    is_russian = client.language_tag and "ru" in client.language_tag.lower()
    advisor_name = meeting.owner.display_name if meeting.owner else "Vlad Donets"
    meeting_date = meeting.scheduled_at.strftime("%B %d, %Y") if meeting.scheduled_at else str(date.today())
    today_str = date.today().isoformat()

    created = []

    # ── Follow-up email ───────────────────────────────────────────────────────
    if settings.toggle_email_followup:
        system = get_prompt("scribe_system") + memory_context
        if is_russian:
            system += f"\n\n{get_prompt('scribe_russian').format(client_name=client.name)}"

        followup_prompt = get_prompt("scribe_followup").format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_date=meeting_date,
            notes=notes[:3000],
            client_context=client_context,
        )

        body = ai.complete(system_prompt=system, user_prompt=followup_prompt)["text"]

        draft = {
            "to": client.email,
            "subject": f"Following Up on Our {meeting.meeting_type} Meeting",
            "body": body,
        }
        if is_russian:
            draft["flag"] = "RUSSIAN-SPEAKING CLIENT — Review before sending."

        item = ApprovalItem.objects.create(
            owner=meeting.owner,
            item_type="email_followup",
            client=client,
            client_name=client.name,
            agent="Scribe",
            draft_content=draft,
        )
        created.append(str(item.id))

    # ── Internal summary ──────────────────────────────────────────────────────
    if settings.toggle_email_summary:
        summary_prompt = get_prompt("scribe_summary").format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_date=meeting_date,
            notes=notes[:3000],
        )

        body = ai.complete(system_prompt=get_prompt("scribe_system") + memory_context, user_prompt=summary_prompt)["text"]

        item = ApprovalItem.objects.create(
            owner=meeting.owner,
            item_type="email_summary",
            client=client,
            client_name=client.name,
            agent="Scribe",
            draft_content={
                "subject": f"[Internal] {meeting.meeting_type} Notes — {client.name} — {meeting_date}",
                "body": body,
            },
        )
        created.append(str(item.id))

    # ── Meeting notes ─────────────────────────────────────────────────────────
    notes_result = ai.complete(
        get_prompt("meeting_notes_system"),
        meeting_notes_user_prompt(notes, client.name, meeting.meeting_type),
    )
    notes_text = _strip_code_fence(notes_result["text"].strip())
    try:
        notes_data = json.loads(notes_text)
    except (json.JSONDecodeError, ValueError):
        notes_data = {"summary": notes_text, "key_points": [], "decisions": [], "action_items": []}

    item = ApprovalItem.objects.create(
        owner=meeting.owner,
        item_type="meeting_notes",
        client=client,
        client_name=client.name,
        agent="Scribe",
        urgency="normal",
        status="pending",
        draft_content=notes_data,
    )
    created.append(str(item.id))

    # ── Action items ──────────────────────────────────────────────────────────
    actions_result = ai.complete(
        get_prompt("action_items_system"),
        action_items_user_prompt(notes, client.name, today_str),
    )
    actions_text = _strip_code_fence(actions_result["text"].strip())
    try:
        actions_data = json.loads(actions_text)
    except (json.JSONDecodeError, ValueError):
        actions_data = {"tasks": []}

    if actions_data.get("tasks"):
        item = ApprovalItem.objects.create(
            owner=meeting.owner,
            item_type="action_items",
            client=client,
            client_name=client.name,
            agent="Scribe",
            urgency="normal",
            status="pending",
            draft_content=actions_data,
        )
        created.append(str(item.id))

    # ── Next meeting / calendar event ─────────────────────────────────────────
    advisor_email = meeting.owner.email or "" if meeting.owner else ""
    client_email = client.email or ""
    calendar_result = ai.complete(
        get_prompt("next_meeting_system"),
        next_meeting_user_prompt(
            notes, client.name, client_email,
            advisor_name, advisor_email, today_str,
        ),
    )
    cal_text = _strip_code_fence(calendar_result["text"].strip())
    try:
        cal_data = json.loads(cal_text)
    except (json.JSONDecodeError, ValueError):
        cal_data = {"needs_date": True, "meeting_agreed": False}

    if cal_data.get("meeting_agreed", False) or cal_data.get("needs_date", False):
        if "platform" not in cal_data:
            cal_data["platform"] = "zoom"
        item = ApprovalItem.objects.create(
            owner=meeting.owner,
            item_type="calendar_event",
            client=client,
            client_name=client.name,
            agent="Scribe",
            urgency="normal",
            status="pending",
            draft_content=cal_data,
        )
        created.append(str(item.id))

    # ── Memory extraction ─────────────────────────────────────────────────────
    memory_result = ai.complete(
        get_prompt("memory_extraction_system"),
        memory_extraction_user_prompt(notes, client.name, existing_memories),
    )
    mem_text = _strip_code_fence(memory_result["text"].strip())
    try:
        memory_data = json.loads(mem_text)
        if isinstance(memory_data, dict):
            for key, value in memory_data.items():
                if key and value:
                    ClientMemory.objects.update_or_create(
                        client=client,
                        key=str(key)[:100],
                        defaults={
                            "value": str(value),
                            "source": "scribe",
                            "source_id": str(meeting.id),
                        },
                    )
    except (json.JSONDecodeError, ValueError):
        pass  # Memory extraction is best-effort

    # Mark meeting as processed
    meeting.processed = True
    meeting.save()

    AgentLog.objects.create(
        agent_name="Scribe",
        action=f"Generated {len(created)} item(s) from {meeting.meeting_type} meeting notes",
        client=client,
        client_name=client.name,
        status="complete",
        output_data={"approval_ids": created},
    )

    return {"created": created, "meeting_id": meeting_id}
