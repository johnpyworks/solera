from datetime import date, timedelta
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Meeting, WeekStats
from .serializers import MeetingSerializer, WeekStatsSerializer
from apps.clients.views import get_client_queryset


def get_meeting_queryset(user):
    if user.role == "super_admin":
        return Meeting.objects.all()
    if user.role == "advisor":
        return Meeting.objects.filter(owner=user)
    return Meeting.objects.filter(client__owner__in=user.assigned_advisors.all())


class MeetingListView(generics.ListCreateAPIView):
    """GET /api/v1/meetings/?upcoming=true  POST /api/v1/meetings/"""
    serializer_class = MeetingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_meeting_queryset(self.request.user)
        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start:
            qs = qs.filter(scheduled_at__gte=start)
        if end:
            qs = qs.filter(scheduled_at__lte=end)
        if self.request.query_params.get("upcoming") == "true":
            qs = qs.filter(is_past=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MeetingDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/meetings/{id}/"""
    serializer_class = MeetingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_meeting_queryset(self.request.user)


class MeetingProcessView(APIView):
    """POST /api/v1/meetings/{id}/process/ — triggers Orchestrator → Scribe + Service Agent"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        qs = get_meeting_queryset(request.user)
        meeting = generics.get_object_or_404(qs, pk=pk)
        if meeting.processed:
            return Response({"detail": "Already processed."}, status=status.HTTP_400_BAD_REQUEST)
        # Import here to avoid circular at module load
        from apps.agents.tasks import process_meeting_task
        process_meeting_task.delay(str(meeting.id))
        return Response({"detail": "Processing started.", "meeting_id": str(meeting.id)})


class CalendarSyncView(APIView):
    """GET /api/v1/meetings/calendar-sync/ — pull Outlook events and upsert"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.agents.tasks import sync_outlook_calendar
        sync_outlook_calendar.delay()
        return Response({"detail": "Calendar sync queued."})


class WeekStatsView(APIView):
    """GET /api/v1/meetings/week-stats/ — current week stats"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = date.today()
        # Find Monday of the current week
        week_start = today - timedelta(days=today.weekday())
        stats, created = WeekStats.objects.get_or_create(
            week_of=week_start,
            defaults=self._compute_stats(request.user, week_start),
        )
        if not created:
            # Refresh computed fields
            computed = self._compute_stats(request.user, week_start)
            for k, v in computed.items():
                setattr(stats, k, v)
            stats.save()
        return Response(WeekStatsSerializer(stats).data)

    def _compute_stats(self, user, week_start):
        week_end = week_start + timedelta(days=7)
        qs = get_meeting_queryset(user)
        meetings_completed = qs.filter(
            scheduled_at__date__gte=week_start,
            scheduled_at__date__lt=week_end,
            is_past=True,
        ).count()
        meetings_scheduled = qs.filter(
            scheduled_at__date__gte=week_start,
            scheduled_at__date__lt=week_end,
        ).count()
        from apps.approvals.models import ApprovalItem
        emails_approved = ApprovalItem.objects.filter(
            item_type__in=["email_followup", "email_summary"],
            status="approved",
            approved_at__date__gte=week_start,
            approved_at__date__lt=week_end,
        ).count()
        emails_pending = ApprovalItem.objects.filter(
            item_type__in=["email_followup", "email_summary"],
            status="pending",
        ).count()
        return {
            "meetings_completed": meetings_completed,
            "meetings_scheduled": meetings_scheduled,
            "emails_approved": emails_approved,
            "emails_pending": emails_pending,
        }
