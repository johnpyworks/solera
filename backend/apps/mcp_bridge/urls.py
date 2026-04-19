from django.urls import path

from . import views
from .views import OutlookCreateEventView


urlpatterns = [
    path("connector/status/", views.ConnectorStatusView.as_view(), name="mcp-connector-status"),
    path("connector/embed-url/", views.ConnectorEmbedUrlView.as_view(), name="mcp-connector-embed-url"),
    path("outlook/events/", views.OutlookEventsView.as_view(), name="mcp-outlook-events"),
    path("outlook/events/create/", OutlookCreateEventView.as_view(), name="outlook-create-event"),
    path("outlook/send-email/", views.OutlookSendEmailView.as_view(), name="mcp-outlook-send"),
    path("zoom/recordings/", views.ZoomRecordingsView.as_view(), name="mcp-zoom-recordings"),
    path("zoom/meetings/", views.ZoomMeetingsView.as_view(), name="mcp-zoom-meetings"),
    path("zoom/transcript/", views.ZoomTranscriptView.as_view(), name="mcp-zoom-transcript"),
    path("teams/meetings/", views.TeamsMeetingsView.as_view(), name="mcp-teams-meetings"),
    path("teams/transcript/", views.TeamsTranscriptView.as_view(), name="mcp-teams-transcript"),
]
