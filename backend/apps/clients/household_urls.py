from django.urls import path
from . import views

urlpatterns = [
    path("<uuid:pk>/members/", views.HouseholdMembersView.as_view(), name="household-members"),
    path("<uuid:pk>/members/<uuid:mid>/notes/", views.HouseholdMemberNoteView.as_view(), name="member-notes"),
]
