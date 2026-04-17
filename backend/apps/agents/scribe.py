"""Scribe Agent — transcript/notes → email drafts in ApprovalItem queue."""
import json
from datetime import date

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompts import (
    SCRIBE_SYSTEM, SCRIBE_FOLLOWUP, SCRIBE_SUMMARY, SCRIBE_RUSSIAN,
)
from apps.approvals.models import ApprovalItem
from apps.meetings.models import Meeting
from apps.settings_app.models import AdvisorSettings


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

    # Build client context (last 3 notes)
    recent_notes = client.notes.order_by("-created_at")[:3]
    client_context = "\n".join(f"- {n.text}" for n in recent_notes) or "No prior notes."

    is_russian = client.language_tag and "ru" in client.language_tag.lower()
    advisor_name = meeting.owner.display_name if meeting.owner else "Vlad Donets"
    meeting_date = meeting.scheduled_at.strftime("%B %d, %Y") if meeting.scheduled_at else str(date.today())

    created = []

    # ── Follow-up email ───────────────────────────────────────────────────────
    if settings.toggle_email_followup:
        system = SCRIBE_SYSTEM
        if is_russian:
            system += f"\n\n{SCRIBE_RUSSIAN.format(client_name=client.name)}"

        followup_prompt = SCRIBE_FOLLOWUP.format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_date=meeting_date,
            notes=notes[:3000],
            client_context=client_context,
        )

        body = ai.complete(system_prompt=system, user_prompt=followup_prompt)

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
        summary_prompt = SCRIBE_SUMMARY.format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_date=meeting_date,
            notes=notes[:3000],
        )

        body = ai.complete(system_prompt=SCRIBE_SYSTEM, user_prompt=summary_prompt)

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

    # Mark meeting as processed
    meeting.processed = True
    meeting.save()

    AgentLog.objects.create(
        agent_name="Scribe",
        action=f"Generated {len(created)} email draft(s) from {meeting.meeting_type} meeting notes",
        client=client,
        client_name=client.name,
        status="complete",
        output_data={"approval_ids": created},
    )

    return {"created": created, "meeting_id": meeting_id}
