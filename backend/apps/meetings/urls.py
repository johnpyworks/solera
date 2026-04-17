from django.urls import path
from . import views

urlpatterns = [
    path("", views.MeetingListView.as_view(), name="meeting-list"),
    path("calendar-sync/", views.CalendarSyncView.as_view(), name="calendar-sync"),
    path("week-stats/", views.WeekStatsView.as_view(), name="week-stats"),
    path("<uuid:pk>/", views.MeetingDetailView.as_view(), name="meeting-detail"),
    path("<uuid:pk>/process/", views.MeetingProcessView.as_view(), name="meeting-process"),
]
