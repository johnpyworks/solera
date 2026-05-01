"""
MCPClient — direct Python implementations for Outlook, Teams, and Zoom.
Credentials are stored in the MCPCredential DB model.
No external Node.js connector required.
"""
from .providers.outlook import OutlookProvider, TeamsProvider
from .providers.zoom import ZoomProvider


def _status(key: str, inst) -> dict:
    configured = inst.is_configured()
    connected = False
    message = ""
    if configured:
        try:
            inst.get_token()
            connected = True
        except Exception as e:
            message = str(e)
    return {"provider": key, "configured": configured, "connected": connected, "message": message}


class MCPClient:
    SERVICES = ("outlook", "teams", "zoom")

    # ── Status / credentials ──────────────────────────────────────

    def get_connector_status(self) -> dict:
        return {
            "outlook": _status("outlook", OutlookProvider()),
            "teams": _status("teams", TeamsProvider()),
            "zoom": _status("zoom", ZoomProvider()),
        }

    def get_credentials(self, service: str) -> dict:
        from .models import MCPCredential
        cred, _ = MCPCredential.objects.get_or_create(provider=service, defaults={"credentials": {}})
        masked = {
            k: ("****" + v[-4:] if len(v) > 4 else "****")
            for k, v in cred.credentials.items()
            if v
        }
        return {
            "configured": bool(cred.credentials),
            "credentials": masked,
            "oauthConnected": cred.is_token_valid(),
        }

    def save_credentials(self, service: str, fields: dict) -> dict:
        from .models import MCPCredential
        cred, _ = MCPCredential.objects.get_or_create(provider=service, defaults={"credentials": {}})
        updated = dict(cred.credentials)
        for k, v in fields.items():
            v = str(v).strip()
            # Skip masked values returned by the UI
            if v and not v.startswith("****"):
                updated[k] = v
        cred.credentials = updated
        # Clear cached token so next call re-validates with new creds
        cred.access_token = ""
        cred.token_expiry = None
        cred.save()
        return {"ok": True}

    def test_connection(self, service: str) -> dict:
        if service == "outlook":
            return OutlookProvider().test()
        if service == "teams":
            return TeamsProvider().test()
        if service == "zoom":
            return ZoomProvider().test()
        return {"ok": False, "message": "Unknown service."}

    def get_embed_url(self) -> str:
        return ""

    # ── Outlook ───────────────────────────────────────────────────

    def get_outlook_events(self, days_ahead: int = 14, start: str = None, end: str = None) -> list:
        return OutlookProvider().get_events(start=start, end=end, days_ahead=days_ahead)

    def send_outlook_email(self, to: str, subject: str, body: str, reply_to: str = "") -> dict:
        return OutlookProvider().send_email(to, subject, body, reply_to)

    def create_meeting_event(self, subject: str, start: str, end: str, attendees: list,
                             location: str = "", html_body: str = "", **kwargs) -> dict:
        platform = kwargs.get("platform", "outlook")
        duration_min = int(kwargs.get("duration_min", 60))
        zoom_meeting_id = ""
        join_url = ""

        if platform == "zoom":
            try:
                z = ZoomProvider().create_meeting(topic=subject, start=start, duration=duration_min)
                if z.get("ok") and z.get("join_url"):
                    zoom_meeting_id = z["meeting_id"]
                    join_url = z["join_url"]
                    location = join_url
                    zoom_link = f'<p><strong>Join Zoom:</strong> <a href="{join_url}">{join_url}</a></p>'
                    html_body = (html_body + zoom_link) if html_body else zoom_link
            except Exception as zoom_err:
                print(f"[MCPClient] Zoom create_meeting failed: {zoom_err}")

        outlook_result = OutlookProvider().create_event(subject, start, end, attendees, location, html_body)
        return {
            **outlook_result,
            "zoomMeetingId": zoom_meeting_id,
            "joinUrl": join_url,
            "outlookCreated": outlook_result.get("ok", False),
            "outlookError": "" if outlook_result.get("ok") else outlook_result.get("message", ""),
        }

    # ── Zoom ──────────────────────────────────────────────────────

    def get_zoom_recordings(self, start: str = None, end: str = None) -> list:
        return ZoomProvider().get_recordings(start=start, end=end)

    def get_zoom_meetings(self, start: str = None, end: str = None) -> list:
        return ZoomProvider().get_meetings(start=start, end=end)

    def get_zoom_transcript(self, meeting_id: str) -> str:
        return ZoomProvider().get_transcript(meeting_id)

    # ── Teams ─────────────────────────────────────────────────────

    def get_teams_meetings(self, start: str = None, end: str = None) -> list:
        return TeamsProvider().get_meetings(start=start, end=end)

    def get_teams_transcript(self, meeting_id: str) -> str:
        return TeamsProvider().get_transcript(meeting_id)
