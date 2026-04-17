from rest_framework import serializers
from .models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "session_id", "client", "role", "content", "file_name", "created_at"]
        read_only_fields = ["id", "created_at", "role"]
