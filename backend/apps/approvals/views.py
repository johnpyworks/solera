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
                    if result.get("ok"):
                        item.sent_at = timezone.now()
                        item.outlook_message_id = result.get("messageId", "")
                        item.save()
                    else:
                        raise Exception(result.get("message", "Send returned ok=false"))
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

        # If action_items → create ClientTask rows + email both parties
        elif item.item_type == "action_items":
            from apps.clients.models import ClientTask
            tasks = item.draft_content.get("tasks", [])
            for t in tasks:
                if t.get("task"):
                    ClientTask.objects.create(
                        client=item.client,
                        title=t["task"],
                        owner_type=t.get("owner", "advisor"),
                        due_date=t.get("due") or None,
                        source_meeting=None,
                    )
            # Email summary to client and advisor (best-effort)
            try:
                from apps.mcp_bridge.client import MCPClient
                body_lines = [
                    "• [{}] {}{}".format(
                        t.get("owner", "advisor"),
                        t["task"],
                        f" — Due {t['due']}" if t.get("due") else "",
                    )
                    for t in tasks if t.get("task")
                ]
                body = "Action items from our meeting:\n\n" + "\n".join(body_lines)
                subject = f"Action Items — {item.client_name}"
                if item.client and item.client.email:
                    MCPClient().send_outlook_email(item.client.email, subject, body)
                if item.owner and item.owner.email:
                    MCPClient().send_outlook_email(item.owner.email, f"[Internal] {subject}", body)
            except Exception:
                pass

        # If calendar_event → always save Meeting to DB, then try MCP invite
        elif item.item_type == "calendar_event":
            from datetime import datetime, timedelta
            from apps.meetings.models import Meeting
            draft = item.draft_content
            calendar_sent = False
            calendar_error = ""

            if draft.get("proposed_date"):
                try:
                    start_dt = datetime.fromisoformat(draft["proposed_date"])
                    duration = int(draft.get("duration_min", 60))

                    # Create Meeting DB record (skip if one already exists for this approval)
                    meeting = Meeting.objects.filter(
                        client=item.client,
                        scheduled_at=start_dt,
                        owner=item.owner,
                    ).first()
                    if not meeting:
                        meeting = Meeting.objects.create(
                            client=item.client,
                            scheduled_at=start_dt,
                            owner=item.owner,
                            meeting_type=draft.get("meeting_type", "Other"),
                            duration_min=duration,
                            location=draft.get("location", ""),
                            is_past=False,
                        )

                    # Best-effort: send Outlook calendar invite via MCP
                    try:
                        from apps.mcp_bridge.client import MCPClient
                        result = MCPClient().create_meeting_event(
                            subject=draft.get("subject", "Meeting"),
                            start=start_dt.isoformat(),
                            end=(start_dt + timedelta(minutes=duration)).isoformat(),
                            attendees=draft.get("attendees", []),
                            location=draft.get("location", ""),
                            html_body=draft.get("body", ""),
                            platform=draft.get("platform", "zoom"),
                            duration_min=duration,
                        )
                        print(f"[Approval] calendar_event MCP result: {result}")
                        if result.get("ok"):
                            meeting.zoom_meeting_id = result.get("zoomMeetingId", "") or ""
                            meeting.outlook_event_id = result.get("eventId", "") or ""
                            meeting.save()
                            calendar_sent = True
                            # Report partial success: Zoom created but Outlook calendar event failed
                            if not result.get("outlookCreated") and result.get("outlookError"):
                                emails_sent = result.get("emailsSent", 0)
                                calendar_error = (
                                    f"Zoom meeting created, {emails_sent} email invite(s) sent. "
                                    f"Outlook calendar entry skipped: {result.get('outlookError')}"
                                )
                        else:
                            calendar_error = result.get("message", "MCP returned not-ok")
                    except Exception as e:
                        calendar_error = str(e)
                        print(f"[Approval] calendar_event MCP exception: {e}")

                except Exception as e:
                    calendar_error = f"Date parse error: {e}"
            else:
                calendar_error = "No date set — invite not sent"

            # Early return with calendar outcome flags
            response_data = ApprovalItemSerializer(item).data
            response_data["calendar_sent"] = calendar_sent
            response_data["calendar_error"] = calendar_error
            return Response(response_data)

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
