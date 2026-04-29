"""Scribe Agent — transcript/notes → 2 approval items: client email + calendar event."""
import json
from datetime import date

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompt_store import (
    get_prompt,
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
    advisor_email = (meeting.owner.email or "") if meeting.owner else ""
    meeting_date = meeting.scheduled_at.strftime("%B %d, %Y") if meeting.scheduled_at else str(date.today())
    today_str = date.today().isoformat()

    created = []

    # Create log before any AI calls so costs can be linked to it
    log = AgentLog.objects.create(
        agent_name="Scribe",
        task_label="Meeting notes → approval drafts",
        action=f"Processing {meeting.meeting_type} transcript for {client.name}",
        client=client,
        client_name=client.name,
        status="running",
    )

    # ── Client follow-up email (summary + both to-do lists) ──────────────────
    if settings.toggle_email_followup:
        system = get_prompt("scribe_system") + memory_context
        if is_russian:
            system += f"\n\n{get_prompt('scribe_russian').format(client_name=client.name)}"

        followup_prompt = get_prompt("scribe_followup").format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_date=meeting_date,
            advisor_name=advisor_name,
            notes=notes[:3000],
            client_context=client_context,
        )

        body = ai.complete(system_prompt=system, user_prompt=followup_prompt, agent_log=log)["text"]

        draft = {
            "to": client.email,
            "subject": f"Following Up on Our {meeting.meeting_type} — {meeting_date}",
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

    # ── Next meeting / calendar event ─────────────────────────────────────────
    client_email = client.email or ""
    calendar_result = ai.complete(
        get_prompt("next_meeting_system"),
        next_meeting_user_prompt(
            notes, client.name, client_email,
            advisor_name, advisor_email, today_str,
        ),
        agent_log=log,
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
        agent_log=log,
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

    log.status = "complete"
    log.action = f"Generated {len(created)} item(s) from {meeting.meeting_type} meeting notes"
    log.output_data = {"approval_ids": created}
    log.save(update_fields=["status", "action", "output_data"])

    return {"created": created, "meeting_id": meeting_id}
