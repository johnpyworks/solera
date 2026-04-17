from rest_framework import serializers
from .models import AdvisorUser


class AdvisorUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvisorUser
        fields = ["id", "username", "email", "display_name", "role", "is_active"]
        read_only_fields = ["id"]


class MeSerializer(serializers.ModelSerializer):
    assigned_advisors = serializers.SerializerMethodField()

    class Meta:
        model = AdvisorUser
        fields = ["id", "username", "email", "display_name", "role", "assigned_advisors"]

    def get_assigned_advisors(self, obj):
        return [
            {"id": str(a.id), "username": a.username, "display_name": a.display_name}
            for a in obj.assigned_advisors.all()
        ]
