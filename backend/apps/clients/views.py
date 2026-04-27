from rest_framework import generics, permissions, status, filters as drf_filters
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination


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
        result = run(
            client_id=str(pk),
            meeting_type=meeting_type,
            advisor_focus=focus,
        )

        if "error" in result:
            return Response({"detail": result["error"]}, status=status.HTTP_404_NOT_FOUND)

        return Response(result)
