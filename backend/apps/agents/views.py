from decimal import Decimal

from django.db.models import Sum, Count, Value, DecimalField
from django.db.models.functions import TruncDate, Coalesce
from django.utils import timezone
from datetime import timedelta

from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AgentLog, AgentPrompt, AgentSessionCost
from .serializers import AgentLogSerializer, AgentPromptSerializer


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


class UsageSummaryView(APIView):
    """GET /api/v1/agent-logs/usage-summary/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)

        base_qs = AgentSessionCost.objects.select_related("agent_log")

        # Today
        today_qs = base_qs.filter(created_at__gte=today_start)
        today_agg = today_qs.aggregate(
            input_tokens=Coalesce(Sum("input_tokens"), 0),
            output_tokens=Coalesce(Sum("output_tokens"), 0),
            cost_usd=Coalesce(Sum("cost_usd"), Value(Decimal("0"))),
        )

        # This week (last 7 days)
        week_qs = base_qs.filter(created_at__gte=week_start)
        week_agg = week_qs.aggregate(
            input_tokens=Coalesce(Sum("input_tokens"), 0),
            output_tokens=Coalesce(Sum("output_tokens"), 0),
            cost_usd=Coalesce(Sum("cost_usd"), Value(Decimal("0"))),
        )

        # By day — last 7 days grouped by date
        by_day_qs = (
            base_qs
            .filter(created_at__gte=week_start)
            .annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(
                total_tokens=Coalesce(Sum("input_tokens"), 0) + Coalesce(Sum("output_tokens"), 0),
                cost_usd=Coalesce(Sum("cost_usd"), Value(Decimal("0"))),
            )
            .order_by("date")
        )
        by_day = [
            {
                "date": str(row["date"]),
                "total_tokens": row["total_tokens"],
                "cost_usd": str(row["cost_usd"]),
            }
            for row in by_day_qs
        ]

        # By agent — group by agent_log__agent_name (null agent_log → "Unknown")
        by_agent_qs = (
            base_qs
            .values("agent_log__agent_name")
            .annotate(
                sessions=Count("id"),
                cost_usd=Coalesce(Sum("cost_usd"), Value(Decimal("0"))),
            )
            .order_by("-cost_usd")
        )
        by_agent = [
            {
                "agent_name": row["agent_log__agent_name"] or "Unknown",
                "sessions": row["sessions"],
                "cost_usd": str(row["cost_usd"]),
            }
            for row in by_agent_qs
        ]

        # Recent sessions — last 20
        recent_qs = base_qs.order_by("-created_at")[:20]
        recent_sessions = [
            {
                "id": obj.id,
                "agent_name": obj.agent_log.agent_name if obj.agent_log else "Unknown",
                "model": obj.model,
                "input_tokens": obj.input_tokens,
                "output_tokens": obj.output_tokens,
                "cost_usd": str(obj.cost_usd),
                "created_at": obj.created_at.isoformat(),
            }
            for obj in recent_qs
        ]

        return Response({
            "today": {
                "input_tokens": today_agg["input_tokens"],
                "output_tokens": today_agg["output_tokens"],
                "cost_usd": str(today_agg["cost_usd"]),
            },
            "this_week": {
                "input_tokens": week_agg["input_tokens"],
                "output_tokens": week_agg["output_tokens"],
                "cost_usd": str(week_agg["cost_usd"]),
            },
            "by_day": by_day,
            "by_agent": by_agent,
            "recent_sessions": recent_sessions,
        })


# ── Agent Prompt CRUD (super_admin only) ──────────────────────────────────────

class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "super_admin"


class AgentPromptListView(generics.ListAPIView):
    """GET /api/v1/agent-logs/prompts/"""
    serializer_class = AgentPromptSerializer
    permission_classes = [IsSuperAdmin]
    queryset = AgentPrompt.objects.all()


class AgentPromptDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/agent-logs/prompts/{key}/"""
    serializer_class = AgentPromptSerializer
    permission_classes = [IsSuperAdmin]
    queryset = AgentPrompt.objects.all()
    lookup_field = "key"

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class AgentPromptResetView(APIView):
    """POST /api/v1/agent-logs/prompts/{key}/reset/"""
    permission_classes = [IsSuperAdmin]

    def post(self, request, key):
        from apps.agents.prompt_store import PROMPT_DEFAULTS
        item = generics.get_object_or_404(AgentPrompt, key=key)
        item.content = PROMPT_DEFAULTS.get(key, "")
        item.updated_by = request.user
        item.save()
        return Response(AgentPromptSerializer(item).data)
