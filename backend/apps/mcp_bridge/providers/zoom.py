"""
Zoom OAuth provider — Authorization Code flow.
User signs in once via "Connect with Zoom"; access token is refreshed from the stored refresh token.

Redirect URIs to register in Zoom Marketplace app:
  Local dev:  http://localhost:8000/api/v1/mcp/connector/oauth/callback/zoom/
  Production: https://soleraportal.yanceyworks.com/api/v1/mcp/connector/oauth/callback/zoom/
"""
import base64
import urllib.parse
from datetime import date, timedelta as td

import httpx
from django.utils import timezone

AUTH_URL = "https://zoom.us/oauth/authorize"
TOKEN_URL = "https://zoom.us/oauth/token"
API_BASE = "https://api.zoom.us/v2"
TIMEOUT = 30


class ZoomProvider:
    PROVIDER_KEY = "zoom"

    def __init__(self):
        from ..models import MCPCredential
        self._db, _ = MCPCredential.objects.get_or_create(provider="zoom", defaults={"credentials": {}})
        creds = self._db.credentials
        self.client_id = creds.get("ZOOM_API_KEY", "")
        self.client_secret = creds.get("ZOOM_API_SECRET", "")

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def _require_config(self):
        if not self.is_configured():
            raise ValueError("Zoom credentials not configured. Enter Client ID and Client Secret in Settings.")

    def _has_refresh_token(self) -> bool:
        self._db.refresh_from_db()
        return bool(self._db.credentials.get("ZOOM_REFRESH_TOKEN", ""))

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

        refresh_token = self._db.credentials.get("ZOOM_REFRESH_TOKEN", "")
        if not refresh_token:
            raise ValueError("Zoom not connected. Click 'Connect with Zoom' to sign in.")

        encoded = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        resp = httpx.post(
            TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            headers={"Authorization": f"Basic {encoded}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" not in data:
            raise ValueError(data.get("reason") or data.get("error_description") or "Zoom token refresh failed")
        self._store_tokens(data)
        return self._db.access_token

    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        self._require_config()
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str):
        encoded = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        resp = httpx.post(
            TOKEN_URL,
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
            headers={"Authorization": f"Basic {encoded}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" not in data:
            raise ValueError(data.get("reason") or data.get("error_description") or "Zoom code exchange failed")
        self._store_tokens(data)

    def _store_tokens(self, data: dict):
        self._db.access_token = data["access_token"]
        self._db.token_expiry = timezone.now() + td(seconds=data.get("expires_in", 3600) - 60)
        if "refresh_token" in data:
            creds = dict(self._db.credentials)
            creds["ZOOM_REFRESH_TOKEN"] = data["refresh_token"]
            self._db.credentials = creds
        self._db.save(update_fields=["access_token", "token_expiry", "credentials"])

    def test(self) -> dict:
        try:
            token = self.get_token()
            resp = httpx.get(
                f"{API_BASE}/users/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if resp.status_code == 200:
                return {"ok": True, "message": "Zoom connection successful."}
            return {"ok": False, "message": f"Zoom API returned {resp.status_code}."}
        except Exception as e:
            return {"ok": False, "message": str(e)}

    def _get(self, path: str, **params) -> dict:
        token = self.get_token()
        resp = httpx.get(
            f"{API_BASE}{path}",
            params=params or None,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()

    def create_meeting(self, topic: str, start: str, duration: int, timezone: str = "UTC") -> dict:
        token = self.get_token()
        resp = httpx.post(
            f"{API_BASE}/users/me/meetings",
            json={
                "topic": topic,
                "type": 2,
                "start_time": start,
                "duration": duration,
                "timezone": timezone,
                "settings": {"join_before_host": True, "waiting_room": False},
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"ok": True, "meeting_id": str(data["id"]), "join_url": data.get("join_url", "")}

    def get_meetings(self, start: str = None, end: str = None) -> list:
        data = self._get("/users/me/meetings", type="scheduled", page_size=50)
        return data.get("meetings", [])

    def get_recordings(self, start: str = None, end: str = None) -> list:
        params = {}
        if start:
            params["from"] = start[:10]
        if end:
            params["to"] = end[:10]
        if not params:
            params["from"] = (date.today() - td(days=30)).isoformat()
        data = self._get("/users/me/recordings", **params)
        return data.get("meetings", [])

    def get_transcript(self, meeting_id: str) -> str:
        try:
            data = self._get(f"/meetings/{meeting_id}/recordings")
            files = data.get("recording_files", [])
            vtt = next((f for f in files if f.get("file_type") == "TRANSCRIPT"), None)
            if not vtt or not vtt.get("download_url"):
                return ""
            token = self.get_token()
            resp = httpx.get(f"{vtt['download_url']}?access_token={token}", timeout=TIMEOUT)
            resp.raise_for_status()
            return _vtt_to_text(resp.text)
        except Exception:
            return ""


def _vtt_to_text(vtt: str) -> str:
    lines = []
    for line in vtt.splitlines():
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line or line.isdigit():
            continue
        lines.append(line)
    return "\n".join(lines)
