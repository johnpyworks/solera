import uuid
from django.db import models


class AgentLog(models.Model):
    AGENT_CHOICES = [
        ("Orchestrator", "Orchestrator"),
        ("Scribe", "Scribe"),
        ("Scheduler", "Scheduler"),
        ("Service Agent", "Service Agent"),
        ("Chat", "Chat"),
    ]
    STATUS_CHOICES = [
        ("running", "Running"),
        ("complete", "Complete"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent_name = models.CharField(max_length=50, choices=AGENT_CHOICES)
    task_label = models.CharField(max_length=100, blank=True)
    action = models.TextField()
    client = models.ForeignKey(
        "clients.Client", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="agent_logs"
    )
    client_name = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="complete")
    error_msg = models.TextField(blank=True)
    input_data = models.JSONField(null=True, blank=True)
    output_data = models.JSONField(null=True, blank=True)
    triggered_by = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.agent_name}: {self.action[:60]}"
