from django.db import models


class AdvisorSettings(models.Model):
    """Singleton settings row. Always id=1."""
    AI_PROVIDER_CHOICES = [
        ("anthropic", "Anthropic Claude"),
        ("openai", "OpenAI GPT"),
    ]

    id = models.IntegerField(primary_key=True, default=1)
    advisor_name = models.CharField(max_length=200, default="Vlad Donets")
    reply_to_email = models.EmailField(blank=True)
    email_signature = models.TextField(blank=True, default="Vlad Donets\nSolera Financial Advisory")
    meeting_cap = models.IntegerField(default=15)

    # AI provider
    ai_provider = models.CharField(max_length=20, choices=AI_PROVIDER_CHOICES, default="anthropic")
    ai_model = models.CharField(max_length=100, default="claude-sonnet-4-6")

    # Approval toggles
    toggle_email_summary = models.BooleanField(default=True)
    toggle_email_followup = models.BooleanField(default=True)
    toggle_reminder_48hr = models.BooleanField(default=True)
    toggle_reminder_24hr = models.BooleanField(default=True)
    toggle_wealthbox_task = models.BooleanField(default=True)
    toggle_form_draft = models.BooleanField(default=True)
    toggle_weekly_summary = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Advisor Settings"
        verbose_name_plural = "Advisor Settings"

    def __str__(self):
        return f"Settings ({self.ai_provider} / {self.ai_model})"

    def save(self, *args, **kwargs):
        self.id = 1  # enforce singleton
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj
