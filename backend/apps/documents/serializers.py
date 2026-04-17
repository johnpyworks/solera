from rest_framework import serializers
from .models import ClientFile, DocumentTree


class DocumentTreeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentTree
        fields = ["id", "build_status", "built_at", "error_msg"]
        read_only_fields = fields


class ClientFileSerializer(serializers.ModelSerializer):
    tree = DocumentTreeSerializer(read_only=True)

    class Meta:
        model = ClientFile
        fields = [
            "id", "client", "meeting", "name", "file_path", "file_type",
            "size_kb", "uploaded_by", "ai_summary", "ai_processed", "tree", "created_at",
        ]
        read_only_fields = ["id", "file_path", "size_kb", "ai_summary", "ai_processed", "created_at"]
