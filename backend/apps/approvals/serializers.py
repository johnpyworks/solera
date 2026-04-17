from rest_framework import serializers
from .models import ApprovalItem


class ApprovalItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalItem
        fields = [
            "id", "task_label", "item_type", "client", "client_name",
            "agent", "urgency", "status", "draft_content",
            "approved_at", "rejected_at", "sent_at", "outlook_message_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "approved_at", "rejected_at", "sent_at"]
