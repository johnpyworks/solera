"""
Microsoft Graph providers for Outlook and Teams.
Uses Authorization Code (delegated) flow — same permissions as the original connector.
User signs in once via OAuth; access token is refreshed automatically from Django.

Redirect URIs to register in Azure AD:
  Local dev:  http://localhost:8000/api/v1/mcp/connector/oauth/callback/outlook/
              http://localhost:8000/api/v1/mcp/connector/oauth/callback/teams/
  Production: https://soleraportal.yanceyworks.com/api/v1/mcp/connector/oauth/callback/outlook/
              https://soleraportal.yanceyworks.com/api/v1/mcp/connector/oauth/callback/teams/
"""
import urllib.parse
from datetime import datetime, timedelta, timezone as _tz

import httpx
from django.utils import timezone

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
AUTH_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
TIMEOUT = 30

SCOPES = {
    "outlook": "Calendars.ReadWrite Mail.Send User.Read offline_access",
    "teams": "OnlineMeetings.Read OnlineMeetingTranscript.Read.All Calendars.Read User.Read offline_access",
}


class _GraphProvider:
    PROVIDER_KEY = ""
    CRED_PREFIX = ""

    def __init__(self):
        from ..models import MCPCredential
        self._db, _ = MCPCredential.objects.get_or_create(
            provider=self.PROVIDER_KEY, defaults={"credentials": {}}
        )
        creds = self._db.credentials
        p = self.CRED_PREFIX
        self.client_id = creds.get(f"{p}CLIENT_ID", "")
        self.client_secret = creds.get(f"{p}CLIENT_SECRET", "")
        self.tenant_id = creds.get(f"{p}TENANT_ID", "")

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.tenant_id)

    def _require_config(self):
        if not self.is_configured():
            raise ValueError(
                f"{self.PROVIDER_KEY.title()} credentials not configured. "
                "Enter Client ID, Client Secret, and Tenant ID in Settings."
            )

    def _has_refresh_token(self) -> bool:
        self._db.refresh_from_db()
        return bool(self._db.credentials.get(f"{self.CRED_PREFIX}REFRESH_TOKEN", ""))

    def is_connected(self) -> bool:
        if not self.is_configured():
            return False
        self._db.refresh_from_db()
        return self._db.is_token_valid() or self._has_refresh_token()

    def get_token(self) -> str:
        self._require_config()
        self._db.refresh_from_db()

        if self._db.is_token_valid():
            return self._db.access_token

        refresh_token = self._db.credentials.get(f"{self.CRED_PREFIX}REFRESH_TOKEN", "")
        if not refresh_token:
            raise ValueError(
                f"{self.PROVIDER_KEY.title()} not connected. "
                "Click 'Connect with Microsoft' to sign in."
            )

        resp = httpx.post(
            TOKEN_URL.format(tenant=self.tenant_id),
            data={
                "grant_type": "refresh_token",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
                "scope": SCOPES[self.PROVIDER_KEY],
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(data.get("error_description") or data.get("error"))
        self._store_tokens(data)
        return self._db.access_token

    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        self._require_config()
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": SCOPES[self.PROVIDER_KEY],
            "state": state,
            "prompt": "select_account",
        }
        qs = urllib.parse.urlencode(params)
        return f"{AUTH_URL.format(tenant=self.tenant_id)}?{qs}"

    def exchange_code(self, code: str, redirect_uri: str):
        resp = httpx.post(
            TOKEN_URL.format(tenant=self.tenant_id),
            data={
                "grant_type": "authorization_code",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "scope": SCOPES[self.PROVIDER_KEY],
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(data.get("error_description") or data.get("error"))
        self._store_tokens(data)

    def _store_tokens(self, data: dict):
        self._db.access_token = data["access_token"]
        self._db.token_expiry = timezone.now() + timedelta(seconds=data.get("expires_in", 3600) - 60)
        if "refresh_token" in data:
            creds = dict(self._db.credentials)
            creds[f"{self.CRED_PREFIX}REFRESH_TOKEN"] = data["refresh_token"]
            self._db.credentials = creds
        self._db.save(update_fields=["access_token", "token_expiry", "credentials", "updated_at"])

    def test(self) -> dict:
        try:
            self._get("/me")
            return {"ok": True, "message": f"{self.PROVIDER_KEY.title()} connection successful."}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def _get(self, path: str, **params) -> dict:
        token = self.get_token()
        resp = httpx.get(
            f"{GRAPH_BASE}{path}",
            params=params or None,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> httpx.Response:
        token = self.get_token()
        resp = httpx.post(
            f"{GRAPH_BASE}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp


class OutlookProvider(_GraphProvider):
    PROVIDER_KEY = "outlook"
    CRED_PREFIX = "MS_"

    def get_events(self, start: str = None, end: str = None, days_ahead: int = 14) -> list:
        if not start or not end:
            now = datetime.now(_tz.utc)
            start = now.isoformat()
            end = (now + timedelta(days=days_ahead)).isoformat()
        data = self._get(
            "/me/calendarView",
            startDateTime=start,
            endDateTime=end,
            **{
                "$orderby": "start/dateTime",
                "$top": "50",
                "$select": "id,subject,start,end,location,onlineMeeting,webLink",
            },
        )
        return data.get("value", [])

    def send_email(self, to: str, subject: str, body: str, reply_to: str = "") -> dict:
        message = {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body},
            "toRecipients": [{"emailAddress": {"address": to}}],
        }
        if reply_to:
            message["replyTo"] = [{"emailAddress": {"address": reply_to}}]
        self._post("/me/sendMail", {"message": message, "saveToSentItems": True})
        return {"ok": True}

    def create_event(self, subject: str, start: str, end: str, attendees: list,
                     location: str = "", html_body: str = "", **kwargs) -> dict:
        event = {
            "subject": subject,
            "start": {"dateTime": start, "timeZone": "UTC"},
            "end": {"dateTime": end, "timeZone": "UTC"},
            "attendees": [
                {"emailAddress": {"address": a["email"], "name": a.get("name", "")}, "type": "required"}
                for a in attendees
            ],
            "body": {"contentType": "HTML", "content": html_body},
        }
        if location:
            event["location"] = {"displayName": location}
        resp = self._post("/me/events", event)
        data = resp.json()
        return {
            "ok": True,
            "eventId": data.get("id"),
            "joinUrl": (data.get("onlineMeeting") or {}).get("joinUrl"),
        }


class TeamsProvider(_GraphProvider):
    PROVIDER_KEY = "teams"
    CRED_PREFIX = "TEAMS_"

    def get_meetings(self, start: str = None, end: str = None) -> list:
        now = datetime.now(_tz.utc)
        if not start:
            start = now.isoformat()
        if not end:
            end = (now + timedelta(days=30)).isoformat()
        data = self._get(
            "/me/calendarView",
            startDateTime=start,
            endDateTime=end,
            **{
                "$filter": "isOnlineMeeting eq true",
                "$top": "50",
                "$select": "id,subject,start,end,onlineMeeting,webLink",
            },
        )
        return data.get("value", [])

    def get_transcript(self, meeting_id: str) -> str:
        try:
            data = self._get(f"/me/onlineMeetings/{meeting_id}/transcripts")
            transcripts = data.get("value", [])
            if not transcripts:
                return ""
            tid = transcripts[0]["id"]
            token = self.get_token()
            resp = httpx.get(
                f"{GRAPH_BASE}/me/onlineMeetings/{meeting_id}/transcripts/{tid}/content",
                headers={"Authorization": f"Bearer {token}"},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            return resp.text
        except Exception:
            return ""
