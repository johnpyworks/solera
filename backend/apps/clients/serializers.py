from rest_framework import serializers
from .models import Client, ClientAddress, ClientKeyDate, Household, HouseholdMember, Note, ClientTask, ClientMemory


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "client", "member", "text", "author", "note_type", "created_at"]
        read_only_fields = ["id", "client", "author", "created_at"]
        extra_kwargs = {
            "text": {"max_length": 5000},
        }


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


class ClientAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientAddress
        fields = [
            "id", "address_type", "address_line1", "address_line2",
            "city", "state", "zip_code", "country", "is_primary",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {
            "zip_code": {"required": False, "allow_blank": True},
            "city":     {"required": False, "allow_blank": True},
            "state":    {"required": False, "allow_blank": True},
        }


class ClientKeyDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientKeyDate
        fields = ["id", "date_type", "date", "label"]
        read_only_fields = ["id"]


class ClientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    full_name         = serializers.SerializerMethodField()
    last_contact_date = serializers.SerializerMethodField()
    owner_username    = serializers.SerializerMethodField()
    household_name    = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id", "first_name", "last_name", "full_name",
            "email", "phone", "language_tag", "meeting_stage",
            "wealthbox_id", "household", "household_name",
            "owner_username", "last_contact_date",
            "is_primary", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()

    def get_last_contact_date(self, obj):
        kd = obj.key_dates.filter(date_type="last_contact").first()
        return str(kd.date) if kd else None

    def get_owner_username(self, obj):
        return obj.owner.username if obj.owner else None

    def get_household_name(self, obj):
        return obj.household.name if obj.household else None


class ClientDetailSerializer(serializers.ModelSerializer):
    """Full serializer with nested household, addresses, and key dates."""
    full_name = serializers.SerializerMethodField()
    household_detail = HouseholdSerializer(source="household", read_only=True)
    addresses = ClientAddressSerializer(many=True, read_only=True)
    key_dates = ClientKeyDateSerializer(many=True, read_only=True)

    # Write-only field: optional address to create on client creation
    address = ClientAddressSerializer(write_only=True, required=False)

    class Meta:
        model = Client
        fields = [
            "id", "first_name", "last_name", "full_name",
            "email", "phone", "language_tag", "meeting_stage",
            "wealthbox_id", "household", "household_detail",
            "addresses", "key_dates",
            "address",  # write-only: create address during POST
            "is_primary", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()

    def create(self, validated_data):
        address_data = validated_data.pop("address", None)
        client = super().create(validated_data)
        if address_data:
            ClientAddress.objects.create(client=client, **address_data)
        return client


class ClientTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientTask
        fields = ["id", "client", "title", "owner_type", "due_date", "status", "source_meeting", "created_at"]
        read_only_fields = ["id", "created_at"]


class ClientMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientMemory
        fields = ["id", "client", "key", "value", "source", "source_id", "updated_at"]
        read_only_fields = ["updated_at"]
