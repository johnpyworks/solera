from django.urls import path
from .views import TableListView, ExecuteQueryView

urlpatterns = [
    path("tables/", TableListView.as_view()),
    path("execute/", ExecuteQueryView.as_view()),
]
