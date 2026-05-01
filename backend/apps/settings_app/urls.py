from django.urls import path
from . import views

urlpatterns = [
    path("", views.AdvisorSettingsView.as_view(), name="settings"),
    path("reset-dev-db/", views.ResetDevDbView.as_view(), name="settings-reset-dev-db"),
]
