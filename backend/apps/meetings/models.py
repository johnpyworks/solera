import uuid
from django.db import models
from django.conf import settings


class Meeting(models.Model):
    MEETING_TYPE_CHOICES = [
        ("Discovery", "Discovery"),
        ("LEAP Process", "LEAP Process"),
        ("Implementation", "Implementation"),
        ("Solera Heartbeat", "Solera Heartbeat"),
        ("30-Day Check-In", "30-Day Check-In"),
        ("Other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="meetings"
    )
    client = models.ForeignKey(
        "clients.Client", on_delete=models.CASCADE, related_name="meetings"
    )
    meeting_type = models.CharField(max_length=50, choices=MEETING_TYPE_CHOICES)
    scheduled_at = models.DateTimeField()
    duration_min = models.IntegerField(default=60)
    location = models.CharField(max_length=200, blank=True)
    is_past = models.BooleanField(default=False)
    transcript_text = models.TextField(blank=True)
    leap_notes_text = models.TextField(blank=True)
    processed = models.BooleanField(default=False)
    # External IDs for MCP sync
    zoom_meeting_id = models.CharField(max_length=100, blank=True)
    teams_meeting_id = models.CharField(max_length=100, blank=True)
    outlook_event_id = models.CharField(max_length=200, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_at"]

    def __str__(self):
        return f"{self.meeting_type} — {self.client.name} @ {self.scheduled_at:%Y-%m-%d}"


class Reminder(models.Model):
    REMINDER_TYPE_CHOICES = [
        ("48hr_email", "48hr Email"),
        ("24hr_sms", "24hr SMS"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("queued", "Queued"),
        ("approved", "Approved"),
        ("sent", "Sent"),
        ("skipped", "Skipped"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="reminders")
    reminder_type = models.CharField(max_length=20, choices=REMINDER_TYPE_CHOICES)
    scheduled_for = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    approval_item_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    def __str__(self):
        return f"{self.reminder_type} for {self.meeting}"


class WeekStats(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    week_of = models.DateField(unique=True)
    meetings_completed = models.IntegerField(default=0)
    meetings_scheduled = models.IntegerField(default=0)
    capacity = models.IntegerField(default=15)
    emails_approved = models.IntegerField(default=0)
    emails_pending = models.IntegerField(default=0)
    commission_close_week = models.BooleanField(default=False)
    friday_off = models.BooleanField(default=False)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Week Stats"

    def __str__(self):
        return f"Week of {self.week_of}"
