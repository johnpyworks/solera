"""
MCPClient — httpx wrapper around the Node.js MCP connector (port 4000).
Django never calls Zoom/Outlook/Teams directly; all calls go through this client.
"""
import httpx
from django.conf import settings


MCP_BASE = getattr(settings, "MCP_BASE_URL", "http://localhost:4000")
TIMEOUT = 30  # seconds


class MCPClient:
    def __init__(self):
        self.base = MCP_BASE.rstrip("/")

    # ── Outlook ───────────────────────────────────────────────────────────────

    def get_outlook_events(self, days_ahead: int = 14) -> list:
        """Return upcoming Outlook calendar events."""
        resp = httpx.get(
            f"{self.base}/api/outlook/events",
            params={"daysAhead": days_ahead},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def send_outlook_email(self, to: str, subject: str, body: str, reply_to: str = "") -> dict:
        """Send email via Outlook. Returns dict with messageId."""
        payload = {"to": to, "subject": subject, "body": body}
        if reply_to:
            payload["replyTo"] = reply_to
        resp = httpx.post(
            f"{self.base}/api/outlook/send-test-email",
            json=payload,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    # ── Zoom ──────────────────────────────────────────────────────────────────

    def get_zoom_recordings(self) -> list:
        resp = httpx.get(f"{self.base}/api/zoom/recordings", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_zoom_transcript(self, meeting_id: str) -> str:
        """Return VTT transcript text for a Zoom meeting."""
        resp = httpx.get(
            f"{self.base}/api/zoom/transcript",
            params={"meetingId": meeting_id},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("transcript", "")

    # ── Teams ─────────────────────────────────────────────────────────────────

    def get_teams_meetings(self) -> list:
        resp = httpx.get(f"{self.base}/api/teams/meetings", timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_teams_transcript(self, meeting_id: str) -> str:
        resp = httpx.get(
            f"{self.base}/api/teams/transcript",
            params={"meetingId": meeting_id},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("transcript", "")
