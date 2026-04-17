from django.urls import path
from . import views

urlpatterns = [
    path("", views.ApprovalListView.as_view(), name="approval-list"),
    path("<uuid:pk>/", views.ApprovalDetailView.as_view(), name="approval-detail"),
    path("<uuid:pk>/approve/", views.ApprovalApproveView.as_view(), name="approval-approve"),
    path("<uuid:pk>/reject/", views.ApprovalRejectView.as_view(), name="approval-reject"),
]
