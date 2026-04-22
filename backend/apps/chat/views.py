import re
import base64
import io

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from .models import ChatMessage
from .serializers import ChatMessageSerializer
from apps.agents.prompt_store import get_prompt


# ── VTT / SRT timestamp stripping ────────────────────────────────

def strip_timestamps(text: str) -> str:
    """Remove VTT/SRT timestamp lines, cue IDs, and WEBVTT header."""
    # Remove WEBVTT header line
    text = re.sub(r'^WEBVTT[^\n]*\n', '', text, flags=re.MULTILINE)
    # Remove timestamp lines: 00:00:00.000 --> 00:00:00.000
    text = re.sub(
        r'^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*$',
        '', text, flags=re.MULTILINE,
    )
    # Remove standalone numeric cue IDs
    text = re.sub(r'^\d+\s*$', '', text, flags=re.MULTILINE)
    # Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ── Text extraction endpoint ──────────────────────────────────────

class ExtractTextView(APIView):
    """POST /api/v1/chat/extract-text/
    Accepts multipart file upload, returns {"text": "..."}.
    Routes by extension:
      .txt/.md/.csv          → UTF-8 decode
      .vtt/.srt              → UTF-8 decode + strip timestamps
      .docx/.odt             → python-docx
      .pdf                   → pdfplumber
      images                 → Claude Vision API
      unsupported (.doc, etc.) → 415
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    IMAGE_EXTS       = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}
    TEXT_EXTS        = {".txt", ".md", ".csv"}
    TS_EXTS          = {".vtt", ".srt"}
    DOC_EXTS         = {".docx", ".odt"}
    PDF_EXTS         = {".pdf"}
    UNSUPPORTED_EXTS = {".doc", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf"}

    MIME_MAP = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".gif": "image/gif",
        ".webp": "image/webp", ".bmp": "image/bmp",
        ".tiff": "image/tiff",
    }

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        ext = ("." + file.name.rsplit(".", 1)[-1].lower()) if "." in file.name else ""

        if ext in self.UNSUPPORTED_EXTS:
            return Response(
                {"detail": f"Unsupported format '{ext}'. Please save as .docx, .pdf, or .txt first."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )

        try:
            text = self._extract(file, ext)
        except Exception as e:
            return Response(
                {"detail": f"Could not extract text: {e}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return Response({"text": text})

    def _extract(self, file, ext):
        if ext in self.TEXT_EXTS:
            return file.read().decode("utf-8", errors="replace")

        if ext in self.TS_EXTS:
            return strip_timestamps(file.read().decode("utf-8", errors="replace"))

        if ext in self.DOC_EXTS:
            return self._extract_docx(file)

        if ext in self.PDF_EXTS:
            return self._extract_pdf(file)

        if ext in self.IMAGE_EXTS:
            return self._extract_image(file, ext)

        # Unknown extension — best-effort UTF-8
        return file.read().decode("utf-8", errors="replace")

    def _extract_docx(self, file):
        import docx
        doc = docx.Document(io.BytesIO(file.read()))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    def _extract_pdf(self, file):
        import pdfplumber
        pages_text = []
        with pdfplumber.open(io.BytesIO(file.read())) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
        return "\n\n".join(pages_text)

    def _extract_image(self, file, ext):
        import anthropic
        media_type = self.MIME_MAP.get(ext, "image/jpeg")
        b64 = base64.standard_b64encode(file.read()).decode("utf-8")

        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract all text from this document or transcript. "
                            "Return only the raw text, preserving speaker labels and structure. "
                            "Do not add any commentary or explanation."
                        ),
                    },
                ],
            }],
        )
        return message.content[0].text


# ── Chat messages ─────────────────────────────────────────────────

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
        content    = request.data.get("content", "").strip()
        client_id  = request.data.get("client_id")

        if not content:
            return Response({"detail": "content is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Save user message
        user_msg = ChatMessage.objects.create(
            session_id=session_id,
            client_id=client_id,
            role="user",
            content=content,
        )

        # ── Client context (name, stage, memory) ──────────────────
        client_context = self._get_client_context(client_id) if client_id else ""

        # ── Approval queue context (injected into every AI response) ─
        approval_context = self._get_approval_context(content)

        # ── AI intent classification (multi-intent) ───────────────────
        intents = self._classify_intents(content, session_id) if client_id else ["general"]
        print(f"[Chat] Detected intents: {intents}")

        schedule_queued   = False
        approval_id       = None
        email_queued      = False
        email_approval_id = None
        transcript_queued = False
        meeting_id        = None
        ask_replies       = []   # questions to ask user for missing info per intent

        if "date_reply" in intents or "schedule" in intents:
            result = self._handle_schedule_intent(content, client_id, request.user)
            print(f"[Chat] _handle_schedule_intent result: {result}")
            if result and result.get("schedule_queued"):
                schedule_queued = True
                approval_id = result["approval_id"]
            elif result and result.get("ask"):
                ask_replies.append(result["reply"])

        if "email" in intents and client_id:
            result = self._handle_email_intent(content, client_id, request.user)
            print(f"[Chat] _handle_email_intent result: {result}")
            if result and result.get("email_queued"):
                email_queued = True
                email_approval_id = result["approval_id"]
            elif result and result.get("ask"):
                ask_replies.append(result["reply"])

        if "transcript" in intents and client_id:
            meeting = self._handle_transcript(content, client_id, request.user)
            if meeting:
                transcript_queued = True
                meeting_id = str(meeting.id)

        # ── Build prompt ───────────────────────────────────────────
        base_system = get_prompt("chat_system_base")

        queued_items = []
        if schedule_queued:
            queued_items.append("a calendar event proposal")
        if email_queued:
            queued_items.append("a draft email")
        if transcript_queued:
            queued_items.append("the meeting transcript for Scribe processing")

        if ask_replies and not queued_items:
            # Nothing was queued — only missing info; skip AI call, return directly
            combined_ask = " Also, ".join(ask_replies)
            assistant_msg = ChatMessage.objects.create(
                session_id=session_id, client_id=client_id,
                role="assistant", content=combined_ask,
            )
            return Response({
                "user": ChatMessageSerializer(user_msg).data,
                "assistant": ChatMessageSerializer(assistant_msg).data,
                "schedule_ask": True,
            }, status=status.HTTP_201_CREATED)

        elif queued_items:
            queued_str = " and ".join(queued_items)
            ask_str = (" Also: " + " ".join(ask_replies)) if ask_replies else ""
            system_prompt = (
                f"You are the Solera AI assistant. The advisor's request has been processed: "
                f"you've added {queued_str} to the Approval Queue for review.{ask_str} "
                "Confirm what was queued and remind them to check the Approval Queue. "
                "Be brief (2-3 sentences)."
            )
            if client_context:
                system_prompt += f"\n\n{client_context}"
            if approval_context:
                system_prompt += f"\n\n{approval_context}"
            user_prompt = (
                "I've just submitted meeting content for processing."
                if transcript_queued
                else content
            )

        else:
            # Regular conversation — include client context + history
            history = ChatMessage.objects.filter(session_id=session_id).order_by("-created_at")[:10]
            history_msgs = [
                {"role": m.role, "content": m.content}
                for m in reversed(list(history))
            ]

            doc_context = self._get_doc_context(client_id, content) if client_id else ""

            system_prompt = base_system
            if client_context:
                system_prompt += f"\n\n{client_context}"
            if doc_context:
                system_prompt += f"\n\nRelevant client document context:\n{doc_context}"
            if approval_context:
                system_prompt += f"\n\n{approval_context}"

            user_prompt = "\n".join(
                f"{m['role'].upper()}: {m['content']}" for m in history_msgs[:-1]
            ) + f"\nUSER: {content}"

        # ── Call AI ────────────────────────────────────────────────
        from apps.agents.provider import AIProvider
        try:
            ai_response = AIProvider().complete(
                system_prompt=system_prompt, user_prompt=user_prompt
            )["text"]
        except Exception as e:
            ai_response = f"[AI unavailable: {e}]"

        # Save assistant response
        assistant_msg = ChatMessage.objects.create(
            session_id=session_id,
            client_id=client_id,
            role="assistant",
            content=ai_response,
        )

        response_data = {
            "user": ChatMessageSerializer(user_msg).data,
            "assistant": ChatMessageSerializer(assistant_msg).data,
        }
        if transcript_queued:
            response_data["transcript_queued"] = True
            response_data["meeting_id"] = meeting_id
        if schedule_queued:
            response_data["schedule_queued"] = True
            response_data["approval_id"] = approval_id
        if email_queued:
            response_data["email_queued"] = True
            response_data["email_approval_id"] = email_approval_id

        return Response(response_data, status=status.HTTP_201_CREATED)

    # ── Client context helpers ─────────────────────────────────────

    def _get_client_context(self, client_id: str) -> str:
        try:
            from apps.clients.models import Client, ClientMemory
            client = Client.objects.get(pk=client_id)
            lines = [
                "Client context:",
                (
                    f"  Name: {client.name}"
                    f" | Stage: {client.meeting_stage}"
                    f" | Email: {client.email or 'N/A'}"
                ),
            ]
            memories = ClientMemory.objects.filter(client_id=client_id)
            if memories.exists():
                lines.append("\nClient memory (from past meetings):")
                for m in memories:
                    lines.append(f"  {m.key}: {m.value}")
            return "\n".join(lines)
        except Exception:
            return ""

    # ── Schedule intent ────────────────────────────────────────────

    def _detect_schedule_intent(self, content: str) -> bool:
        lower = content.lower()
        keywords = [
            "schedule", "book a meeting", "set up a meeting", "arrange a meeting",
            "plan a meeting", "add to calendar", "set a meeting", "calendar invite",
        ]
        return any(kw in lower for kw in keywords)

    def _detect_pending_schedule(self, session_id: str, content: str) -> bool:
        """Return True if the last assistant message asked for a date and this looks like a date reply."""
        try:
            last = ChatMessage.objects.filter(
                session_id=session_id, role="assistant"
            ).order_by("-created_at").first()
            if not last:
                return False
            ask_phrases = ["what date and time", "when would you like", "what time works"]
            if not any(p in last.content.lower() for p in ask_phrases):
                return False
            date_tokens = [
                "jan", "feb", "mar", "apr", "may", "jun",
                "jul", "aug", "sep", "oct", "nov", "dec",
                "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                "today", "tomorrow", "next", " am", " pm", ":",
            ]
            lower = content.lower()
            return len(content) < 200 and any(t in lower for t in date_tokens)
        except Exception:
            return False

    def _handle_schedule_intent(self, content: str, client_id: str, user):
        """Returns dict: {"ask": True, "reply": "..."} or {"schedule_queued": True, "approval_id": str}."""
        try:
            import json as _json
            from datetime import datetime as _dt
            from apps.clients.models import Client
            from apps.approvals.models import ApprovalItem
            from apps.agents.provider import AIProvider

            client = Client.objects.get(pk=client_id, is_active=True)
            today_str = _dt.now().strftime("%A, %B %d, %Y")  # e.g. "Friday, April 18, 2026"

            extraction_prompt = (
                f'Today is {today_str}. '
                f'Extract scheduling details from this message. The client is "{client.name}".\n\n'
                f'Message: "{content}"\n\n'
                "Rules:\n"
                "- If a day like 'the 24th' is given, use the next occurrence of that day in the current or next month.\n"
                "- If no time is given, set needs_date=true so we can ask.\n"
                "- proposed_date must be a future datetime.\n\n"
                "Return JSON only (no explanation or markdown):\n"
                '{"proposed_date": "YYYY-MM-DDTHH:MM:SS" or null, '
                '"duration_min": <integer default 60>, '
                '"meeting_type": "<short description e.g. Annual Review, Next Steps>", '
                '"subject": "<concise meeting title 4-8 words, do NOT include client name>", '
                '"needs_date": <true if date OR time is missing, false if both are clear>}'
            )

            ai_result = AIProvider().complete(
                system_prompt=(
                    "You are a scheduling assistant. Extract meeting details from advisor messages. "
                    "Return only valid JSON with no extra text."
                ),
                user_prompt=extraction_prompt,
            )
            raw = ai_result["text"].strip()
            print(f"[Chat] Schedule extraction raw AI response: {raw!r}")
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1] if len(parts) >= 2 else raw
                if raw.startswith("json"):
                    raw = raw[4:]

            extracted = _json.loads(raw.strip())
            print(f"[Chat] Extracted schedule data: {extracted}")

            # No date given — ask for it instead of creating an unusable approval
            needs_date = extracted.get("needs_date") or not extracted.get("proposed_date")
            if needs_date:
                return {
                    "ask": True,
                    "reply": (
                        f"What date and time works for the meeting with {client.name}? "
                        "You can say something like \"May 20th at 2pm\"."
                    ),
                }

            attendees = [{"name": client.name, "email": client.email or ""}]
            advisor_name  = (user.get_full_name() if hasattr(user, "get_full_name") else "") or user.username
            advisor_email = getattr(user, "email", "") or ""
            attendees.append({"name": advisor_name, "email": advisor_email})

            raw_subject = extracted.get("subject", "").strip()
            subject = f"{raw_subject} — {client.name}" if raw_subject else f"Meeting with {client.name}"

            draft = {
                "subject": subject,
                "platform": "zoom",
                "proposed_date": extracted.get("proposed_date"),
                "duration_min": extracted.get("duration_min", 60),
                "meeting_type": extracted.get("meeting_type", "Meeting"),
                "attendees": attendees,
                "body": "",
            }

            approval = ApprovalItem.objects.create(
                client_id=client_id,
                client_name=client.name,
                item_type="calendar_event",
                agent="Orchestrator",
                urgency="normal",
                draft_content=draft,
            )
            print(f"[Chat] Created calendar_event approval id={approval.id} for client={client.name}")
            return {"schedule_queued": True, "approval_id": str(approval.id)}

        except Exception as e:
            import traceback
            print(f"[Chat] _handle_schedule_intent ERROR: {e}")
            print(traceback.format_exc())
            return None

    def _handle_email_intent(self, content: str, client_id: str, user):
        """Draft a follow-up email via AI and queue it for advisor approval.
        Returns {"email_queued": True, "approval_id": str} or {"ask": True, "reply": str}
        """
        try:
            import json as _json
            from apps.clients.models import Client
            from apps.approvals.models import ApprovalItem
            from apps.agents.provider import AIProvider

            client = Client.objects.get(pk=client_id, is_active=True)

            if not client.email:
                return {
                    "ask": True,
                    "reply": (
                        f"I don't have an email address on file for {client.name}. "
                        "Please add it to their profile first."
                    ),
                }

            draft_prompt = (
                f'Draft a professional email to {client.name} based on this advisor request:\n'
                f'"{content}"\n\n'
                'The email is from a Solera Financial advisor. Keep it concise and professional.\n'
                'Return JSON only (no markdown):\n'
                '{"subject": "<clear subject line>", "body": "<full email body>"}'
            )
            ai_result = AIProvider().complete(
                system_prompt=(
                    "You are a financial advisor email drafter. "
                    "Return only valid JSON with no markdown or extra text."
                ),
                user_prompt=draft_prompt,
            )
            raw = ai_result["text"].strip()
            print(f"[Chat] Email draft raw AI response: {raw!r}")
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1] if len(parts) >= 2 else raw
                if raw.startswith("json"):
                    raw = raw[4:]
            extracted = _json.loads(raw.strip())

            draft = {
                "to": client.email,
                "subject": extracted.get("subject", f"Follow-up — {client.name}"),
                "body": extracted.get("body", ""),
            }
            approval = ApprovalItem.objects.create(
                client_id=client_id,
                client_name=client.name,
                item_type="email_followup",
                agent="Chat",
                urgency="normal",
                draft_content=draft,
            )
            print(f"[Chat] Created email_followup approval id={approval.id} for client={client.name}")
            return {"email_queued": True, "approval_id": str(approval.id)}

        except Exception as e:
            import traceback
            print(f"[Chat] _handle_email_intent ERROR: {e}")
            print(traceback.format_exc())
            return None

    # ── Transcript helpers ─────────────────────────────────────────

    def _detect_transcript(self, content: str) -> bool:
        """Return True if the message looks like a meeting transcript."""
        lower = content.lower()
        keywords = [
            "transcript", "meeting notes", "process this",
            "zoom call", "here's my notes", "here is my notes",
            "meeting transcript", "please process",
        ]
        if any(kw in lower for kw in keywords):
            return True

        if len(content) > 400:
            lines = [l.strip() for l in content.split("\n") if l.strip()]
            dialogue_lines = sum(
                1 for l in lines
                if ":" in l and len(l.split(":")[0].strip()) < 30 and len(l) > 10
            )
            if dialogue_lines >= 3:
                return True

        return False

    def _handle_transcript(self, content: str, client_id: str, user):
        """Save transcript to a meeting and queue the Scribe pipeline."""
        try:
            from apps.clients.models import Client
            from apps.meetings.models import Meeting
            from apps.agents.tasks import process_meeting_task
            from django.utils import timezone

            client = Client.objects.get(pk=client_id, is_active=True)
            print(f"[Chat] Processing transcript for client={client.name}, len={len(content)}")

            meeting = (
                Meeting.objects.filter(client=client, processed=False, transcript_text="")
                .order_by("-scheduled_at")
                .first()
            )
            if not meeting:
                meeting = (
                    Meeting.objects.filter(client=client, processed=False)
                    .order_by("-scheduled_at")
                    .first()
                )
            if not meeting:
                meeting = Meeting.objects.create(
                    client=client,
                    owner=user,
                    meeting_type="Discovery",
                    scheduled_at=timezone.now(),
                    is_past=True,
                )

            meeting.transcript_text = content
            meeting.save()
            print(f"[Chat] Transcript saved to meeting id={meeting.id}, queuing Scribe task")

            process_meeting_task.delay(str(meeting.id))
            return meeting

        except Exception as e:
            import traceback
            print(f"[Chat] _handle_transcript ERROR: {e}")
            print(traceback.format_exc())
            return None

    def _get_approval_context(self, content: str) -> str:
        """Build a brief pending approval summary to inject into every AI response."""
        try:
            from apps.approvals.models import ApprovalItem
            pending_qs = ApprovalItem.objects.filter(status="pending")
            pending_count = pending_qs.count()
            if pending_count == 0:
                return "Current pending approvals: 0 items."
            context = f"Current pending approvals: {pending_count} item(s)."
            APPROVAL_KEYWORDS = ["approval", "pending", "queue", "what needs", "approve", "waiting", "review", "outstanding"]
            if any(kw in content.lower() for kw in APPROVAL_KEYWORDS):
                lines = []
                for a in pending_qs.order_by("-created_at")[:10]:
                    lines.append(f"  - [{a.item_type}] {a.client_name} — created {a.created_at:%b %d}")
                context += "\nPending items:\n" + "\n".join(lines)
            return context
        except Exception:
            return ""

    def _classify_intents(self, content: str, session_id: str) -> list:
        """Classify advisor message intent via AI. Supports multi-intent messages.
        Returns list of applicable intents, e.g. ['schedule', 'email'].
        Valid labels: schedule | email | transcript | check_approvals | general
        """
        from apps.agents.provider import AIProvider

        # Fast path: pending schedule reply — no AI call needed
        if self._detect_pending_schedule(session_id, content):
            return ["date_reply"]

        prompt = (
            "Classify this advisor message. It may contain MULTIPLE requests.\n"
            "List ALL applicable intents, comma-separated. If nothing matches, return 'general'.\n\n"
            "Intents:\n"
            "- schedule: schedule or book a meeting with a client\n"
            "- email: draft or send an email or follow-up message to a client\n"
            "- transcript: submit meeting notes or a transcript for AI processing\n"
            "- check_approvals: ask what items are pending in the approval queue\n"
            "- general: anything else\n\n"
            f"Message: {content[:600]}\n\n"
            "Examples:\n"
            '  "email John about the form and schedule a meeting Friday" → schedule,email\n'
            '  "process this transcript" → transcript\n'
            '  "what is pending?" → check_approvals\n'
            '  "how is the client doing?" → general'
        )
        try:
            result = AIProvider().complete(
                system_prompt=(
                    "You are an intent classifier for a financial advisor AI system. "
                    "Respond with ONLY comma-separated labels from: schedule, email, transcript, check_approvals, general"
                ),
                user_prompt=prompt,
            )
            valid = {"schedule", "email", "transcript", "check_approvals", "general"}
            labels = [l.strip().lower() for l in result["text"].split(",")]
            filtered = [l for l in labels if l in valid]
            return filtered if filtered else ["general"]
        except Exception as e:
            print(f"[Chat] _classify_intents error: {e}")
            return ["general"]

    def _get_doc_context(self, client_id, question):
        """Load document trees for client and return summary as context hint."""
        try:
            from apps.documents.models import DocumentTree
            trees = DocumentTree.objects.filter(
                client_id=client_id, build_status="complete"
            ).select_related("file")
            if not trees.exists():
                return ""
            summaries = []
            for t in trees[:3]:
                if t.tree_json:
                    root = t.tree_json
                    summary = root.get("summary", "") if isinstance(root, dict) else ""
                    summaries.append(f"[{t.file.name}] {summary}")
            return "\n".join(summaries)
        except Exception:
            return ""
