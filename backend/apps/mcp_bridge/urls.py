from django.urls import path
from . import views

urlpatterns = [
    path("outlook/events/", views.OutlookEventsView.as_view(), name="mcp-outlook-events"),
    path("outlook/send-email/", views.OutlookSendEmailView.as_view(), name="mcp-outlook-send"),
    path("zoom/recordings/", views.ZoomRecordingsView.as_view(), name="mcp-zoom-recordings"),
    path("zoom/transcript/", views.ZoomTranscriptView.as_view(), name="mcp-zoom-transcript"),
    path("teams/meetings/", views.TeamsMeetingsView.as_view(), name="mcp-teams-meetings"),
    path("teams/transcript/", views.TeamsTranscriptView.as_view(), name="mcp-teams-transcript"),
]
