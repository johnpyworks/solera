import uuid
from django.db import models
from django.conf import settings


class ApprovalItem(models.Model):
    ITEM_TYPE_CHOICES = [
        ("email_followup", "Client Follow-Up Email"),
        ("email_summary", "Post-Meeting Summary"),
        ("reminder_48hr", "48hr Reminder"),
        ("reminder_24hr", "24hr Reminder"),
        ("action_items", "Action Items"),
        ("meeting_notes", "Meeting Notes"),
        ("calendar_event", "Calendar Event"),
        ("questionnaire_link", "Questionnaire Link"),
        ("form", "Form Draft"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("edited", "Edited"),
    ]
    URGENCY_CHOICES = [
        ("normal", "Normal"),
        ("high", "High"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="approval_items"
    )
    task_label = models.CharField(max_length=100, blank=True)
    item_type = models.CharField(max_length=30, choices=ITEM_TYPE_CHOICES)
    client = models.ForeignKey(
        "clients.Client", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="approvals"
    )
    client_name = models.CharField(max_length=200, blank=True)
    agent = models.CharField(max_length=50, blank=True)
    urgency = models.CharField(max_length=20, choices=URGENCY_CHOICES, default="normal")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    draft_content = models.JSONField(default=dict)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    outlook_message_id = models.CharField(max_length=200, blank=True)
    edit_history = models.JSONField(default=list, blank=True)
    # Stores: [{"edited_at": "ISO8601", "edited_by": "username", "previous_content": {...}}]
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_item_type_display()} — {self.client_name} [{self.status}]"
