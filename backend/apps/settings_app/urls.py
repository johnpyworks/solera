from django.urls import path
from . import views

urlpatterns = [
    path("", views.AdvisorSettingsView.as_view(), name="settings"),
]
