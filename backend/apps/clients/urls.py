from django.urls import path
from . import views
from .views import ClientTasksView, ClientTaskDetailView, ClientMemoriesView, ClientMeetingPrepView

urlpatterns = [
    path("", views.ClientListView.as_view(), name="client-list"),
    path("<uuid:pk>/", views.ClientDetailView.as_view(), name="client-detail"),
    path("<uuid:pk>/notes/", views.ClientNotesView.as_view(), name="client-notes"),
    path("<uuid:pk>/meetings/", views.ClientMeetingsView.as_view(), name="client-meetings"),
    path("<uuid:pk>/approvals/", views.ClientApprovalsView.as_view(), name="client-approvals"),
    path("<uuid:pk>/submissions/", views.ClientSubmissionsView.as_view(), name="client-submissions"),
    path("<uuid:pk>/files/", views.ClientFilesView.as_view(), name="client-files"),
    path("<uuid:pk>/tasks/", ClientTasksView.as_view(), name="client-tasks"),
    path("<uuid:pk>/tasks/<uuid:task_pk>/", ClientTaskDetailView.as_view(), name="client-task-detail"),
    path("<uuid:pk>/memories/", ClientMemoriesView.as_view(), name="client-memories"),
    path("<uuid:pk>/prep/", ClientMeetingPrepView.as_view(), name="client-meeting-prep"),
]
