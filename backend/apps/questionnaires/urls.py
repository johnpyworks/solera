from django.urls import path
from . import views

urlpatterns = [
    path("tokens/", views.TokenListView.as_view(), name="token-list"),
    path("tokens/create/", views.TokenCreateView.as_view(), name="token-create"),
    path("tokens/<str:token>/", views.TokenValidateView.as_view(), name="token-validate"),
    path("tokens/<str:token>/submit/", views.TokenSubmitView.as_view(), name="token-submit"),
]
