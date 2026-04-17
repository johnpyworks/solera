from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ApprovalItem
from .serializers import ApprovalItemSerializer


def get_approval_queryset(user):
    if user.role == "super_admin":
        return ApprovalItem.objects.all()
    if user.role == "advisor":
        return ApprovalItem.objects.filter(owner=user)
    # Assistants: read-only access via assigned advisors
    return ApprovalItem.objects.filter(owner__in=user.assigned_advisors.all())


class ApprovalListView(generics.ListAPIView):
    """GET /api/v1/approvals/?status=pending"""
    serializer_class = ApprovalItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_approval_queryset(self.request.user)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs


class ApprovalDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/approvals/{id}/ — edit draft_content"""
    serializer_class = ApprovalItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_approval_queryset(self.request.user)

    def perform_update(self, serializer):
        # Mark as edited if draft_content changes
        instance = self.get_object()
        new_content = self.request.data.get("draft_content")
        if new_content and new_content != instance.draft_content:
            serializer.save(status="edited")
        else:
            serializer.save()


class ApprovalApproveView(APIView):
    """POST /api/v1/approvals/{id}/approve/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role == "assistant":
            return Response({"detail": "Assistants cannot approve items."}, status=status.HTTP_403_FORBIDDEN)

        qs = get_approval_queryset(request.user)
        item = generics.get_object_or_404(qs, pk=pk)

        if item.status not in ("pending", "edited"):
            return Response({"detail": f"Cannot approve item with status '{item.status}'."}, status=status.HTTP_400_BAD_REQUEST)

        item.status = "approved"
        item.approved_at = timezone.now()
        item.save()

        # If email type → send via MCP
        if item.item_type in ("email_followup", "email_summary", "reminder_48hr", "reminder_24hr"):
            try:
                from apps.mcp_bridge.client import MCPClient
                draft = item.draft_content
                to_email = draft.get("to") or (item.client.email if item.client else "")
                subject = draft.get("subject", "")
                body = draft.get("body", "")
                if to_email and subject:
                    result = MCPClient().send_outlook_email(to_email, subject, body)
                    message_id = result.get("messageId", "")
                    item.sent_at = timezone.now()
                    item.outlook_message_id = message_id
                    item.save()
            except Exception as e:
                # Log but don't fail approval — email send is best-effort
                from apps.agents.models import AgentLog
                AgentLog.objects.create(
                    agent_name="Service Agent",
                    action=f"Email send failed for approval {pk}: {e}",
                    client=item.client,
                    client_name=item.client_name,
                    status="failed",
                    error_msg=str(e),
                )

        return Response(ApprovalItemSerializer(item).data)


class ApprovalRejectView(APIView):
    """POST /api/v1/approvals/{id}/reject/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.role == "assistant":
            return Response({"detail": "Assistants cannot reject items."}, status=status.HTTP_403_FORBIDDEN)

        qs = get_approval_queryset(request.user)
        item = generics.get_object_or_404(qs, pk=pk)
        item.status = "rejected"
        item.rejected_at = timezone.now()
        item.save()
        return Response(ApprovalItemSerializer(item).data)
