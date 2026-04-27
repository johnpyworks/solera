"""
MCPClient wraps the local Node.js MCP connector.
Django never calls Outlook, Zoom, or Teams directly.
"""

import httpx
from django.conf import settings


MCP_BASE = getattr(settings, "MCP_BASE_URL", "http://localhost:4000")
TIMEOUT = 30


class MCPClient:
    SERVICES = ("outlook", "teams", "zoom")

    def __init__(self):
        self.base = MCP_BASE.rstrip("/")

    def _get(self, path: str, **kwargs):
        resp = httpx.get(f"{self.base}{path}", timeout=TIMEOUT, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, **kwargs):
        resp = httpx.post(f"{self.base}{path}", timeout=TIMEOUT, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def get_embed_url(self) -> str:
        return self.base

    def get_connector_status(self) -> dict:
        providers = {}
        for service in self.SERVICES:
            data = self._get(f"/api/credentials/{service}")
            providers[service] = {
                "provider": service,
                "configured": bool(data.get("configured")),
                "connected": bool(data.get("oauthConnected")),
                "message": data.get("message") or "",
            }
        return providers

    def get_outlook_events(self, days_ahead: int = 14, start: str | None = None, end: str | None = None) -> list:
        params = {}
        if start and end:
            params["start"] = start
            params["end"] = end
        else:
            params["daysAhead"] = days_ahead
        return self._get("/api/outlook/events", params=params)

    def send_outlook_email(self, to: str, subject: str, body: str, reply_to: str = "") -> dict:
        payload = {"to": to, "subject": subject, "body": body}
        if reply_to:
            payload["replyTo"] = reply_to
        return self._post("/api/outlook/send-email", json=payload)

    def get_zoom_recordings(self, start: str | None = None, end: str | None = None) -> list:
        params = {}
        if start and end:
            params["start"] = start
            params["end"] = end
        return self._get("/api/zoom/recordings", params=params or None)

    def get_zoom_meetings(self, start: str | None = None, end: str | None = None) -> list:
        """Fetch Zoom calendar meetings — upcoming + past recordings for the given date range."""
        params = {}
        if start and end:
            params["start"] = start
            params["end"] = end
        return self._get("/api/zoom/meetings", params=params or None)

    def get_zoom_transcript(self, meeting_id: str) -> str:
        data = self._get("/api/zoom/transcript", params={"meetingId": meeting_id})
        return data.get("transcript", "")

    def get_teams_meetings(self, start: str | None = None, end: str | None = None) -> list:
        params = {}
        if start and end:
            params["start"] = start
            params["end"] = end
        return self._get("/api/teams/meetings", params=params or None)

    def get_teams_transcript(self, meeting_id: str) -> str:
        data = self._get("/api/teams/transcript", params={"meetingId": meeting_id})
        return data.get("transcript", "")

    def create_meeting_event(self, subject: str, start: str, end: str, attendees: list,
                             location: str = "", html_body: str = "", platform: str = "teams",
                             duration_min: int = 60) -> dict:
        """Create an Outlook calendar event with optional Zoom/Teams meeting link.

        attendees: list of {"name": str, "email": str}
        platform: "zoom" or "teams"
        start/end: ISO 8601 datetime strings
        Returns: {"ok": bool, "eventId": str, "joinUrl": str|None, "zoomMeetingId": str|None}
        """
        return self._post("/api/outlook/events/create", json={
            "subject": subject,
            "start": start,
            "end": end,
            "attendees": attendees,
            "location": location,
            "htmlBody": html_body,
            "platform": platform,
            "durationMin": duration_min,
        })
