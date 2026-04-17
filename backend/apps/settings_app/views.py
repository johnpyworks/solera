from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AdvisorSettings
from .serializers import AdvisorSettingsSerializer


class AdvisorSettingsView(APIView):
    """GET /api/v1/settings/   PATCH /api/v1/settings/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        settings_obj = AdvisorSettings.get()
        return Response(AdvisorSettingsSerializer(settings_obj).data)

    def patch(self, request):
        if request.user.role not in ("super_admin", "advisor"):
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = AdvisorSettings.get()
        serializer = AdvisorSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
