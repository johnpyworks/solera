from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .client import MCPClient


class OutlookEventsView(APIView):
    """GET /api/v1/mcp/outlook/events/ — live Outlook calendar events"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            events = MCPClient().get_outlook_events(days_ahead=int(request.query_params.get("days", 14)))
            return Response(events)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class OutlookSendEmailView(APIView):
    """POST /api/v1/mcp/outlook/send-email/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        to = request.data.get("to")
        subject = request.data.get("subject")
        body = request.data.get("body")
        if not all([to, subject, body]):
            return Response({"detail": "to, subject, body are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = MCPClient().send_outlook_email(to, subject, body)
            return Response(result)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ZoomRecordingsView(APIView):
    """GET /api/v1/mcp/zoom/recordings/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(MCPClient().get_zoom_recordings())
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ZoomTranscriptView(APIView):
    """GET /api/v1/mcp/zoom/transcript/?meetingId=..."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        meeting_id = request.query_params.get("meetingId")
        if not meeting_id:
            return Response({"detail": "meetingId is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response({"transcript": MCPClient().get_zoom_transcript(meeting_id)})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class TeamsMeetingsView(APIView):
    """GET /api/v1/mcp/teams/meetings/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(MCPClient().get_teams_meetings())
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class TeamsTranscriptView(APIView):
    """GET /api/v1/mcp/teams/transcript/?meetingId=..."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        meeting_id = request.query_params.get("meetingId")
        if not meeting_id:
            return Response({"detail": "meetingId is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response({"transcript": MCPClient().get_teams_transcript(meeting_id)})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
