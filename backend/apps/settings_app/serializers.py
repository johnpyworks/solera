from rest_framework import serializers
from .models import AdvisorSettings


class AdvisorSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvisorSettings
        fields = [
            "advisor_name", "reply_to_email", "email_signature", "meeting_cap",
            "ai_provider", "ai_model",
            "toggle_email_summary", "toggle_email_followup",
            "toggle_reminder_48hr", "toggle_reminder_24hr",
            "toggle_wealthbox_task", "toggle_form_draft", "toggle_weekly_summary",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
