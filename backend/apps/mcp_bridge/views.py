from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .client import MCPClient


class ConnectorStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        client = MCPClient()
        try:
            providers = client.get_connector_status()
        except Exception as e:
            # Connector unreachable — return degraded 200 so the dashboard still loads
            providers = {
                svc: {"provider": svc, "configured": False, "connected": False, "message": str(e)}
                for svc in MCPClient.SERVICES
            }
        return Response({
            "providers": providers,
            "embed_url": client.get_embed_url(),
        })


class ConnectorEmbedUrlView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response({"embed_url": MCPClient().get_embed_url()})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class OutlookEventsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            start = request.query_params.get("start")
            end = request.query_params.get("end")
            events = MCPClient().get_outlook_events(
                days_ahead=int(request.query_params.get("days", 14)),
                start=start,
                end=end,
            )
            return Response(events)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class OutlookSendEmailView(APIView):
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


class OutlookCreateEventView(APIView):
    """POST /api/v1/mcp/outlook/events/create/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        try:
            result = MCPClient().create_meeting_event(
                subject=data.get("subject", ""),
                start=data.get("start", ""),
                end=data.get("end", ""),
                attendees=data.get("attendees", []),
                location=data.get("location", ""),
                html_body=data.get("body", ""),
                platform=data.get("platform", "teams"),
                duration_min=data.get("duration_min", 60),
            )
            return Response(result)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ZoomRecordingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(MCPClient().get_zoom_recordings(
                start=request.query_params.get("start"),
                end=request.query_params.get("end"),
            ))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ZoomMeetingsView(APIView):
    """GET /api/v1/mcp/zoom/meetings/ — upcoming + past recordings for the given month."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(MCPClient().get_zoom_meetings(
                start=request.query_params.get("start"),
                end=request.query_params.get("end"),
            ))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ZoomTranscriptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        meeting_id = request.query_params.get("meetingId")
        if not meeting_id:
            return Response({"detail": "meetingId is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response({
                "provider": "zoom",
                "meeting_id": meeting_id,
                "transcript": MCPClient().get_zoom_transcript(meeting_id),
            })
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class TeamsMeetingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            return Response(MCPClient().get_teams_meetings(
                start=request.query_params.get("start"),
                end=request.query_params.get("end"),
            ))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class TeamsTranscriptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        meeting_id = request.query_params.get("meetingId")
        if not meeting_id:
            return Response({"detail": "meetingId is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response({
                "provider": "teams",
                "meeting_id": meeting_id,
                "transcript": MCPClient().get_teams_transcript(meeting_id),
            })
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
