import uuid
from django.db import models


class AgentLog(models.Model):
    AGENT_CHOICES = [
        ("Orchestrator", "Orchestrator"),
        ("Scribe", "Scribe"),
        ("Scheduler", "Scheduler"),
        ("Service Agent", "Service Agent"),
        ("Chat", "Chat"),
        ("MeetingPrepAgent", "Meeting Prep Agent"),
        ("WikiCompiler", "Wiki Compiler"),
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


class AgentSessionCost(models.Model):
    agent_log          = models.ForeignKey(
        AgentLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="costs"
    )
    model              = models.CharField(max_length=100)
    input_tokens       = models.IntegerField(default=0)
    output_tokens      = models.IntegerField(default=0)
    cache_read_tokens  = models.IntegerField(default=0)
    cache_write_tokens = models.IntegerField(default=0)
    cost_usd           = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AgentPrompt(models.Model):
    key         = models.CharField(max_length=100, unique=True)
    name        = models.CharField(max_length=200)
    agent_name  = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    content     = models.TextField()
    is_template = models.BooleanField(default=False)
    variables   = models.JSONField(default=list, blank=True)
    updated_at  = models.DateTimeField(auto_now=True)
    updated_by  = models.ForeignKey(
        "users.AdvisorUser", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="prompt_edits",
    )

    class Meta:
        ordering = ["agent_name", "key"]

    def __str__(self):
        return f"{self.agent_name}: {self.key}"
