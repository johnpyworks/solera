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

    # Catch any meeting within the next 48 hours that hasn't been reminded yet.
    # The old 47-49hr narrow window missed meetings booked less than 49hrs in advance.
    upcoming = Meeting.objects.filter(
        scheduled_at__gte=now,
        scheduled_at__lte=now + timedelta(hours=48),
        is_past=False,
    ).exclude(
        reminders__reminder_type="48hr_email"
    ).select_related("client", "owner")

    created = []
    for meeting in upcoming:

        client = meeting.client
        advisor_name = meeting.owner.display_name if meeting.owner else "Vlad Donets"
        # Convert UTC → configured local timezone (America/Los_Angeles) before formatting
        local_dt = timezone.localtime(meeting.scheduled_at)
        # %-I is Linux-only; build cross-platform 12-hour time without leading zero
        _h = local_dt.hour % 12 or 12
        _m = local_dt.strftime("%M")
        _ap = local_dt.strftime("%p")
        meeting_dt = local_dt.strftime(f"%A, %B %d at {_h}:{_m} {_ap}")
        language_tag = client.language_tag or ""

        join_url = meeting.zoom_join_url or ""
        # If we have a Zoom URL, pass it. If not, just say Zoom — never promise "link to be provided"
        # to avoid the AI generating a false commitment to send a link later.
        location_str = join_url or meeting.location or "Zoom"

        prompt = get_prompt("scheduler_reminder_48hr").format(
            client_name=client.name,
            meeting_type=meeting.meeting_type,
            meeting_datetime=meeting_dt,
            location=location_str,
            advisor_name=advisor_name,
            language_tag=language_tag,
        )

        is_russian = "ru" in language_tag.lower()

        try:
            result = AIProvider().complete(system_prompt=get_prompt("scheduler_system"), user_prompt=prompt)
            body = result["text"]
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
