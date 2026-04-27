from django.urls import path
from . import views

urlpatterns = [
    path("usage-summary/", views.UsageSummaryView.as_view(), name="usage-summary"),
    path("prompts/", views.AgentPromptListView.as_view(), name="agent-prompt-list"),
    path("prompts/<str:key>/reset/", views.AgentPromptResetView.as_view(), name="agent-prompt-reset"),
    path("prompts/<str:key>/", views.AgentPromptDetailView.as_view(), name="agent-prompt-detail"),
    path("", views.AgentLogListView.as_view(), name="agent-log-list"),
]
