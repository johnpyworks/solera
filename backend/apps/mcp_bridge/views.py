import secrets

from django.conf import settings as dj_settings
from django.shortcuts import redirect
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
        return Response({"providers": providers})


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


class ConnectorCredentialsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, service):
        if service not in MCPClient.SERVICES:
            return Response({"detail": "Unknown service."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(MCPClient().get_credentials(service))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def post(self, request, service):
        if service not in MCPClient.SERVICES:
            return Response({"detail": "Unknown service."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(MCPClient().save_credentials(service, request.data))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class ConnectorTestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, service):
        if service not in MCPClient.SERVICES:
            return Response({"detail": "Unknown service."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(MCPClient().test_connection(service))
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class OAuthStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, service):
        if service not in ("outlook", "teams", "zoom"):
            return Response({"detail": "OAuth not supported for this service."}, status=status.HTTP_400_BAD_REQUEST)
        from .models import MCPCredential
        from .providers.outlook import OutlookProvider, TeamsProvider
        from .providers.zoom import ZoomProvider
        cred, _ = MCPCredential.objects.get_or_create(provider=service, defaults={"credentials": {}})
        state = secrets.token_urlsafe(16)
        prefix = "MS_" if service == "outlook" else ("TEAMS_" if service == "teams" else "ZOOM_")
        creds = dict(cred.credentials)
        creds[f"{prefix}OAUTH_STATE"] = state
        cred.credentials = creds
        cred.save(update_fields=["credentials"])

        base = getattr(dj_settings, "PORTAL_BASE_URL", "http://localhost:8000")
        redirect_uri = f"{base}/api/v1/mcp/connector/oauth/callback/{service}/"
        if service == "outlook":
            provider = OutlookProvider()
        elif service == "teams":
            provider = TeamsProvider()
        else:
            provider = ZoomProvider()
        return Response({"auth_url": provider.get_auth_url(redirect_uri, state)})


class OAuthCallbackView(APIView):
    permission_classes = []  # Browser redirect — no JWT header

    def get(self, request, service):
        frontend_base = getattr(dj_settings, "FRONTEND_BASE_URL", "http://localhost:5173")
        settings_url = f"{frontend_base}/settings"

        code = request.query_params.get("code", "")
        state = request.query_params.get("state", "")
        error = request.query_params.get("error", "")

        if error:
            return redirect(f"{settings_url}?mcp_error={error}")
        if not code or not state:
            return redirect(f"{settings_url}?mcp_error=missing_code")

        try:
            from .models import MCPCredential
            from .providers.outlook import OutlookProvider, TeamsProvider
            from .providers.zoom import ZoomProvider
            cred = MCPCredential.objects.get(provider=service)
            prefix = "MS_" if service == "outlook" else ("TEAMS_" if service == "teams" else "ZOOM_")
            stored_state = cred.credentials.get(f"{prefix}OAUTH_STATE", "")
            if state != stored_state:
                return redirect(f"{settings_url}?mcp_error=state_mismatch")

            base = getattr(dj_settings, "PORTAL_BASE_URL", "http://localhost:8000")
            redirect_uri = f"{base}/api/v1/mcp/connector/oauth/callback/{service}/"
            if service == "outlook":
                provider = OutlookProvider()
            elif service == "teams":
                provider = TeamsProvider()
            else:
                provider = ZoomProvider()
            provider.exchange_code(code, redirect_uri)

            # Refresh from DB so we get the tokens _store_tokens() just saved,
            # then only remove the OAUTH_STATE without clobbering the refresh token.
            cred.refresh_from_db()
            creds = dict(cred.credentials)
            creds.pop(f"{prefix}OAUTH_STATE", None)
            cred.credentials = creds
            cred.save(update_fields=["credentials"])

            return redirect(f"{settings_url}?mcp_connected={service}")
        except Exception as e:
            return redirect(f"{settings_url}?mcp_error={str(e)[:120]}")


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
