from django.urls import path
from . import views

urlpatterns = [
    path("messages/", views.ChatMessagesView.as_view(), name="chat-messages"),
]
