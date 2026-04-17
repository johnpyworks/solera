from django.urls import path
from . import views

urlpatterns = [
    path("", views.AgentLogListView.as_view(), name="agent-log-list"),
]
