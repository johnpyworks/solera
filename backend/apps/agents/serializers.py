from rest_framework import serializers
from .models import AgentLog, AgentPrompt


class AgentLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentLog
        fields = [
            "id", "agent_name", "task_label", "action", "client",
            "client_name", "status", "error_msg", "input_data",
            "output_data", "triggered_by", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AgentPromptSerializer(serializers.ModelSerializer):
    default_content = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    def get_default_content(self, obj):
        from apps.agents.prompt_store import PROMPT_DEFAULTS
        return PROMPT_DEFAULTS.get(obj.key, "")

    def get_updated_by_name(self, obj):
        return obj.updated_by.display_name if obj.updated_by else None

    class Meta:
        model = AgentPrompt
        fields = [
            "key", "name", "agent_name", "description", "content",
            "is_template", "variables", "updated_at",
            "updated_by_name", "default_content",
        ]
        read_only_fields = [
            "key", "name", "agent_name", "description",
            "is_template", "variables", "updated_at",
            "updated_by_name", "default_content",
        ]
        # content is intentionally writable
