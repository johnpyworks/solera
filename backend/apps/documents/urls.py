from django.urls import path
from . import views

urlpatterns = [
    path("upload/", views.DocumentUploadView.as_view(), name="document-upload"),
    path("search/", views.DocumentSearchView.as_view(), name="document-search"),
    path("<uuid:pk>/", views.DocumentDeleteView.as_view(), name="document-delete"),
]
