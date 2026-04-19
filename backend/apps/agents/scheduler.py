"""Scheduler Agent — creates 48hr reminder approval items for upcoming meetings."""
from datetime import datetime, timedelta, timezone as dt_tz

from django.utils import timezone

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompt_store import get_prompt
from apps.approvals.models import ApprovalItem
from apps.meetings.models import Meeting, Reminder
from apps.settings_app.models import AdvisorSettings


def check_and_queue_reminders():
    """Called by Celery beat hourly. Find meetings 47-49hrs away; create reminder items."""
    settings = AdvisorSettings.get()
    if not settings.toggle_reminder_48hr:
        return {"skipped": "48hr reminders disabled"}

    now = timezone.now()
    window_start = now + timedelta(hours=47)
    window_end = now + timedelta(hours=49)

    upcoming = Meeting.objects.filter(
        scheduled_at__gte=window_start,
        scheduled_at__lte=window_end,
        is_past=False,
    ).select_related("client", "owner")

    created = []
    for meeting in upcoming:
        # Skip if reminder already queued for this meeting
        if Reminder.objects.filter(meeting=meeting, reminder_type="48hr_email").exists():
            continue

        client = meeting.client
        advisor_name = meeting.owner.display_name if meeting.owner else "Vlad Donets"
        meeting_dt = meeting.scheduled_at.strftime("%A, %B %d at %-I:%M %p")
        language_tag = client.language_tag or ""

        prompt = get_prompt("scheduler_reminder_48hr").format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_datetime=meeting_dt,
            location=meeting.location or "Zoom",
            advisor_name=advisor_name,
            language_tag=language_tag,
        )

        is_russian = "ru" in language_tag.lower()

        try:
            body = AIProvider().complete(system_prompt=get_prompt("scheduler_system"), user_prompt=prompt)
        except Exception as e:
            body = f"[Draft unavailable: {e}]"

        draft = {
            "to": client.email,
            "subject": f"Reminder: Your Solera Meeting — {meeting_dt}",
            "body": body,
        }
        if is_russian:
            draft["flag"] = "RUSSIAN-SPEAKING CLIENT — Review before sending."

        approval = ApprovalItem.objects.create(
            owner=meeting.owner,
            item_type="reminder_48hr",
            client=client,
            client_name=client.name,
            agent="Scheduler",
            draft_content=draft,
        )

        reminder = Reminder.objects.create(
            meeting=meeting,
            reminder_type="48hr_email",
            scheduled_for=meeting.scheduled_at - timedelta(hours=48),
            approval_item_id=approval.id,
            status="queued",
        )

        AgentLog.objects.create(
            agent_name="Scheduler",
            action=f"Generated 48hr reminder for {client.name} — {meeting.meeting_type}",
            client=client,
            client_name=client.name,
            status="complete",
            output_data={"approval_id": str(approval.id), "reminder_id": str(reminder.id)},
        )

        created.append(str(approval.id))

    return {"created": created, "count": len(created)}
