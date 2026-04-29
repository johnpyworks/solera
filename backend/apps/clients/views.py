import logging

from rest_framework import generics, permissions, status, filters as drf_filters
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

logger = logging.getLogger(__name__)


class ClientPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

from .models import Client, Household, HouseholdMember, Note, ClientTask, ClientMemory
from .serializers import (
    ClientListSerializer, ClientDetailSerializer,
    HouseholdSerializer, HouseholdMemberSerializer, NoteSerializer,
    ClientTaskSerializer, ClientMemorySerializer,
)
from apps.meetings.models import Meeting
from apps.meetings.serializers import MeetingSerializer
from apps.approvals.models import ApprovalItem
from apps.approvals.serializers import ApprovalItemSerializer
from apps.questionnaires.models import QuestionnaireSubmission
from apps.questionnaires.serializers import QuestionnaireSubmissionSerializer


def get_client_queryset(user):
    """Return queryset of clients the requesting user can see."""
    if user.role == "super_admin":
        return Client.objects.filter(is_active=True)
    if user.role == "advisor":
        return Client.objects.filter(owner=user, is_active=True)
    # assistant: see clients of all assigned advisors
    return Client.objects.filter(owner__in=user.assigned_advisors.all(), is_active=True)


class ClientListView(generics.ListCreateAPIView):
    """GET /api/v1/clients/ — list clients scoped by role.
       POST /api/v1/clients/ — create (advisor/admin only)."""
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ClientPagePagination
    filter_backends = [drf_filters.SearchFilter, drf_filters.OrderingFilter]
    search_fields = ["first_name", "last_name", "email"]
    ordering_fields = ["last_name", "first_name", "meeting_stage", "created_at"]
    ordering = ["last_name", "first_name"]

    def get_serializer_class(self):
        return ClientDetailSerializer if self.request.method == "POST" else ClientListSerializer

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        stage = self.request.query_params.get("meeting_stage")
        if stage:
            qs = qs.filter(meeting_stage=stage)
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ClientDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/clients/{id}/"""
    serializer_class = ClientDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_client_queryset(self.request.user)

    def destroy(self, request, *args, **kwargs):
        # Soft delete
        client = self.get_object()
        client.is_active = False
        client.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClientNotesView(generics.ListCreateAPIView):
    """GET/POST /api/v1/clients/{id}/notes/"""
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        client = self._get_client()
        return Note.objects.filter(client=client)

    def _get_client(self):
        qs = get_client_queryset(self.request.user)
        return generics.get_object_or_404(qs, pk=self.kwargs["pk"])

    def perform_create(self, serializer):
        client = self._get_client()
        author = self.request.user.display_name or self.request.user.username
        note = serializer.save(client=client, author=author)
        # Compile note text into client wiki (meeting_history / client_background)
        from apps.agents.tasks import compile_wiki_from_note
        compile_wiki_from_note.delay(str(note.id))


class ClientMeetingsView(generics.ListAPIView):
    """GET /api/v1/clients/{id}/meetings/"""
    serializer_class = MeetingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return Meeting.objects.filter(client=client)


class ClientApprovalsView(generics.ListAPIView):
    """GET /api/v1/clients/{id}/approvals/"""
    serializer_class = ApprovalItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return ApprovalItem.objects.filter(client=client)


class ClientSubmissionsView(generics.ListAPIView):
    """GET /api/v1/clients/{id}/submissions/"""
    serializer_class = QuestionnaireSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return QuestionnaireSubmission.objects.filter(client=client)


class ClientFilesView(APIView):
    """GET /api/v1/clients/{id}/files/ — list files (stub; upload is via /documents/)"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        from apps.documents.models import ClientFile
        from apps.documents.serializers import ClientFileSerializer
        qs = get_client_queryset(request.user)
        client = generics.get_object_or_404(qs, pk=pk)
        files = ClientFile.objects.filter(client=client)
        return Response(ClientFileSerializer(files, many=True).data)


# ── Households ────────────────────────────────────────────────────────────────

class HouseholdMembersView(generics.ListCreateAPIView):
    """GET/POST /api/v1/households/{id}/members/"""
    serializer_class = HouseholdMemberSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return HouseholdMember.objects.filter(household_id=self.kwargs["pk"])

    def perform_create(self, serializer):
        household = generics.get_object_or_404(Household, pk=self.kwargs["pk"])
        serializer.save(household=household)


class HouseholdMemberNoteView(generics.CreateAPIView):
    """POST /api/v1/households/{id}/members/{mid}/notes/"""
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        member = generics.get_object_or_404(
            HouseholdMember, pk=self.kwargs["mid"], household_id=self.kwargs["pk"]
        )
        author = self.request.user.display_name or self.request.user.username
        serializer.save(member=member, author=author)


class ClientTasksView(generics.ListCreateAPIView):
    """GET/POST /api/v1/clients/{id}/tasks/"""
    serializer_class = ClientTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return ClientTask.objects.filter(client=client)

    def perform_create(self, serializer):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        serializer.save(client=client)


class ClientTaskDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/clients/{pk}/tasks/{task_pk}/"""
    serializer_class = ClientTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return generics.get_object_or_404(ClientTask, pk=self.kwargs["task_pk"], client=client)


class ClientMemoriesView(generics.ListAPIView):
    """GET /api/v1/clients/{id}/memories/"""
    serializer_class = ClientMemorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        client = generics.get_object_or_404(qs, pk=self.kwargs["pk"])
        return ClientMemory.objects.filter(client=client)


class ClientMeetingPrepView(APIView):
    """POST /api/v1/clients/{id}/prep/
    Body: { meeting_type (optional), focus (optional) }
    Returns: { brief, articles_used, client_name }"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_client_queryset(request.user)
        generics.get_object_or_404(qs, pk=pk)

        meeting_type = request.data.get("meeting_type", "")
        focus = request.data.get("focus", "")

        from apps.agents.meeting_prep import run
        try:
            result = run(
                client_id=str(pk),
                meeting_type=meeting_type,
                advisor_focus=focus,
            )
        except Exception as exc:
            logger.exception("Meeting prep failed for client %s", pk)
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if "error" in result:
            return Response({"detail": result["error"]}, status=status.HTTP_404_NOT_FOUND)

        return Response(result)


class ClientPrepEmailView(APIView):
    """POST /api/v1/clients/{id}/prep/email/
    Body: { brief, recipients (list), client_name, meeting_type }
    Sends the prep brief to the given recipients via Django email."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_client_queryset(request.user)
        generics.get_object_or_404(qs, pk=pk)

        brief = request.data.get("brief", "").strip()
        recipients = request.data.get("recipients", [])
        client_name = request.data.get("client_name", "")
        meeting_type = request.data.get("meeting_type", "")

        if not brief:
            return Response({"detail": "brief is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not recipients or not any("@" in r for r in recipients):
            return Response({"detail": "at least one valid recipient email is required"}, status=status.HTTP_400_BAD_REQUEST)

        subject = f"Meeting Prep Brief — {client_name}"
        if meeting_type:
            subject += f" ({meeting_type})"

        html_body = f"""<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:820px;margin:40px auto;color:#1a1a1a;line-height:1.7;font-size:14px">
<p style="color:#6b7280;font-size:12px">Meeting Prep Brief &nbsp;&middot;&nbsp; {client_name}{(' &nbsp;&middot;&nbsp; ' + meeting_type) if meeting_type else ''}</p>
<pre style="white-space:pre-wrap;font-family:inherit">{brief}</pre>
</body></html>"""

        from django.core.mail import send_mail
        try:
            send_mail(
                subject=subject,
                message=brief,
                from_email=None,
                recipient_list=recipients,
                html_message=html_body,
                fail_silently=False,
            )
        except Exception as exc:
            logger.exception("Failed to send prep brief email for client %s", pk)
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"sent_to": recipients})
