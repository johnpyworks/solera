from rest_framework import serializers
from .models import AgentLog


class AgentLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentLog
        fields = [
            "id", "agent_name", "task_label", "action", "client",
            "client_name", "status", "error_msg", "input_data",
            "output_data", "triggered_by", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
