from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatMessage
from .serializers import ChatMessageSerializer


class ChatMessagesView(APIView):
    """GET /api/v1/chat/messages/?session_id=...
       POST /api/v1/chat/messages/ — send message, get AI response"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get("session_id", "global")
        messages = ChatMessage.objects.filter(session_id=session_id).order_by("created_at")[:100]
        return Response(ChatMessageSerializer(messages, many=True).data)

    def post(self, request):
        session_id = request.data.get("session_id", "global")
        content = request.data.get("content", "").strip()
        client_id = request.data.get("client_id")

        if not content:
            return Response({"detail": "content is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Save user message
        user_msg = ChatMessage.objects.create(
            session_id=session_id,
            client_id=client_id,
            role="user",
            content=content,
        )

        # Build conversation history (last 10 messages)
        history = ChatMessage.objects.filter(session_id=session_id).order_by("-created_at")[:10]
        history_msgs = [
            {"role": m.role, "content": m.content}
            for m in reversed(list(history))
        ]

        # Inject document context if client session and documents exist
        doc_context = ""
        if client_id:
            doc_context = self._get_doc_context(client_id, content)

        system_prompt = (
            "You are a knowledgeable AI assistant for Solera Financial Advisory, supporting advisors Vlad and Slava. "
            "You think and respond aligned with the Solera philosophy and the LEAP financial model. "
            "You never give advice that contradicts Solera's approach to protection, savings, growth, cash flow, and debt. "
            "Be concise, professional, and advisor-focused."
        )
        if doc_context:
            system_prompt += f"\n\nRelevant client document context:\n{doc_context}"

        from apps.agents.provider import AIProvider
        user_prompt = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in history_msgs[:-1]
        ) + f"\nUSER: {content}"

        try:
            ai_response = AIProvider().complete(system_prompt=system_prompt, user_prompt=user_prompt)
        except Exception as e:
            ai_response = f"[AI unavailable: {e}]"

        # Save assistant response
        assistant_msg = ChatMessage.objects.create(
            session_id=session_id,
            client_id=client_id,
            role="assistant",
            content=ai_response,
        )

        return Response({
            "user": ChatMessageSerializer(user_msg).data,
            "assistant": ChatMessageSerializer(assistant_msg).data,
        }, status=status.HTTP_201_CREATED)

    def _get_doc_context(self, client_id, question):
        """Load document trees for client and do a quick relevance check."""
        try:
            from apps.documents.models import DocumentTree
            trees = DocumentTree.objects.filter(client_id=client_id, build_status="complete").select_related("file")
            if not trees.exists():
                return ""
            # Summarize available trees as context hint
            summaries = []
            for t in trees[:3]:
                if t.tree_json:
                    root = t.tree_json
                    summary = root.get("summary", "") if isinstance(root, dict) else ""
                    summaries.append(f"[{t.file.name}] {summary}")
            return "\n".join(summaries)
        except Exception:
            return ""
