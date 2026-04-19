from django.urls import path
from . import views

urlpatterns = [
    path("messages/", views.ChatMessagesView.as_view(), name="chat-messages"),
    path("extract-text/", views.ExtractTextView.as_view(), name="chat-extract-text"),
]
