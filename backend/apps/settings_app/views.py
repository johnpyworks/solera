from django.conf import settings as dj_settings
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


class ResetDevDbView(APIView):
    """POST /api/v1/settings/reset-dev-db/
    Super-admin only. Blocked entirely when DEBUG=False."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not dj_settings.DEBUG:
            return Response(
                {"detail": "This endpoint is only available in development mode."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.role != "super_admin":
            return Response({"detail": "Super admin only."}, status=status.HTTP_403_FORBIDDEN)

        from apps.clients.models import Client
        from apps.meetings.models import Meeting
        from apps.approvals.models import ApprovalItem
        from apps.documents.models import ClientFile, DocumentTree
        from apps.questionnaires.models import QuestionnaireSubmission, QuestionnaireToken
        from apps.chat.models import ChatMessage
        from apps.agents.models import AgentLog

        counts = {
            "chat_messages":       ChatMessage.objects.all().delete()[0],
            "agent_logs":          AgentLog.objects.all().delete()[0],
            "questionnaire_tokens": QuestionnaireToken.objects.all().delete()[0],
            "questionnaire_submissions": QuestionnaireSubmission.objects.all().delete()[0],
            "approval_items":      ApprovalItem.objects.all().delete()[0],
            "client_files":        ClientFile.objects.all().delete()[0],
            "document_trees":      DocumentTree.objects.all().delete()[0],
            "meetings":            Meeting.objects.all().delete()[0],
            "clients":             Client.objects.all().delete()[0],
        }
        return Response({"ok": True, "deleted": counts})
