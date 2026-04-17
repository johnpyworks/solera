from rest_framework import generics, permissions
from .models import AgentLog
from .serializers import AgentLogSerializer


class AgentLogListView(generics.ListAPIView):
    """GET /api/v1/agent-logs/?client=<uuid>"""
    serializer_class = AgentLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AgentLog.objects.all()
        client_id = self.request.query_params.get("client")
        if client_id:
            qs = qs.filter(client_id=client_id)
        return qs
