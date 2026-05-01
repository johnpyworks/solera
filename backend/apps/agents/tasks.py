"""Celery tasks wiring agents to the task queue."""
from celery import shared_task


@shared_task(name="agents.process_meeting")
def process_meeting_task(meeting_id: str):
    from apps.agents.orchestrator import route
    return route("process_meeting", meeting_id=meeting_id)


@shared_task(name="agents.sync_outlook_calendar")
def sync_outlook_calendar():
    """Pull Outlook events and upsert as Meeting rows (no duplicates by outlook_event_id)."""
    from apps.mcp_bridge.client import MCPClient
    from apps.meetings.models import Meeting
    from apps.users.models import AdvisorUser
    from django.utils.dateparse import parse_datetime
    from django.utils import timezone

    try:
        events = MCPClient().get_outlook_events(days_ahead=30)
    except Exception as e:
        return {"error": str(e)}

    # Use vlad as default owner; TODO: map per-advisor OAuth tokens
    vlad = AdvisorUser.objects.filter(username="vlad").first()

    upserted = 0
    for ev in events:
        outlook_id = ev.get("id") or ev.get("outlook_event_id")
        if not outlook_id:
            continue

        client_id = ev.get("client_id")  # MCP connector may attach this
        scheduled_at_raw = ev.get("start") or ev.get("scheduledAt")
        if not scheduled_at_raw:
            continue
        if isinstance(scheduled_at_raw, dict):
            scheduled_at_raw = scheduled_at_raw.get("dateTime", "")

        scheduled_at = parse_datetime(str(scheduled_at_raw))
        if not scheduled_at:
            continue
        if timezone.is_naive(scheduled_at):
            scheduled_at = timezone.make_aware(scheduled_at)

        is_past = scheduled_at < timezone.now()

        Meeting.objects.update_or_create(
            outlook_event_id=outlook_id,
            defaults={
                "owner": vlad,
                "client_id": client_id,
                "meeting_type": ev.get("meetingType", "Other"),
                "scheduled_at": scheduled_at,
                "duration_min": ev.get("durationMin", 60),
                "location": (ev.get("location") or {}).get("displayName", "") or ev.get("location", ""),
                "is_past": is_past,
            }
        ) if client_id else None

        upserted += 1

    return {"upserted": upserted}


@shared_task(name="agents.compile_wiki_from_note")
def compile_wiki_from_note(note_id: str):
    from apps.agents.wiki_compiler import run_from_note
    try:
        result = run_from_note(note_id)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "failed", "note_id": note_id, "error": str(e)}


@shared_task(name="agents.check_and_queue_reminders")
def check_and_queue_reminders():
    from apps.agents.scheduler import check_and_queue_reminders as _check
    return _check()


@shared_task(name="agents.generate_weekly_summary")
def generate_weekly_summary():
    """Compute WeekStats for the current week and cache in DB."""
    from datetime import date, timedelta
    from apps.meetings.models import WeekStats, Meeting
    from apps.approvals.models import ApprovalItem

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=7)

    meetings_completed = Meeting.objects.filter(
        scheduled_at__date__gte=week_start,
        scheduled_at__date__lt=week_end,
        is_past=True,
    ).count()
    meetings_scheduled = Meeting.objects.filter(
        scheduled_at__date__gte=week_start,
        scheduled_at__date__lt=week_end,
    ).count()
    emails_approved = ApprovalItem.objects.filter(
        item_type__in=["email_followup", "email_summary"],
        status="approved",
        approved_at__date__gte=week_start,
        approved_at__date__lt=week_end,
    ).count()
    emails_pending = ApprovalItem.objects.filter(
        item_type__in=["email_followup", "email_summary"],
        status="pending",
    ).count()

    stats, _ = WeekStats.objects.update_or_create(
        week_of=week_start,
        defaults={
            "meetings_completed": meetings_completed,
            "meetings_scheduled": meetings_scheduled,
            "emails_approved": emails_approved,
            "emails_pending": emails_pending,
        },
    )
    return {"week_of": str(week_start), "meetings_completed": meetings_completed}
