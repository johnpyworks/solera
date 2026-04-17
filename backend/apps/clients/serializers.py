from rest_framework import serializers
from .models import Client, Household, HouseholdMember, Note


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "client", "member", "text", "author", "note_type", "created_at"]
        read_only_fields = ["id", "created_at"]


class HouseholdMemberSerializer(serializers.ModelSerializer):
    notes = NoteSerializer(many=True, read_only=True)

    class Meta:
        model = HouseholdMember
        fields = ["id", "household", "name", "email", "phone", "relationship", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class HouseholdSerializer(serializers.ModelSerializer):
    members = HouseholdMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Household
        fields = ["id", "name", "primary_client", "members", "created_at"]
        read_only_fields = ["id", "created_at"]


class ClientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    class Meta:
        model = Client
        fields = [
            "id", "name", "email", "phone", "language_tag", "meeting_stage",
            "wealthbox_id", "assigned_advisor", "anniversary_date",
            "last_contact_date", "is_primary", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ClientDetailSerializer(serializers.ModelSerializer):
    """Full serializer with nested household info."""
    household_detail = HouseholdSerializer(source="household", read_only=True)

    class Meta:
        model = Client
        fields = [
            "id", "name", "email", "phone", "language_tag", "meeting_stage",
            "wealthbox_id", "assigned_advisor", "anniversary_date",
            "last_contact_date", "household", "household_detail",
            "is_primary", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
