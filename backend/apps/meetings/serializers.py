from rest_framework import serializers
from .models import Meeting, Reminder, WeekStats


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = ["id", "meeting", "reminder_type", "scheduled_for", "sent_at", "status"]
        read_only_fields = ["id"]


class MeetingSerializer(serializers.ModelSerializer):
    reminders = ReminderSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "id", "client", "client_name", "meeting_type", "scheduled_at",
            "duration_min", "location", "is_past", "transcript_text",
            "leap_notes_text", "processed", "zoom_meeting_id",
            "teams_meeting_id", "outlook_event_id", "reminders",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WeekStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeekStats
        fields = "__all__"
