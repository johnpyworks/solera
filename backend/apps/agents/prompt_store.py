"""
DB-backed prompt store.
Agent files import get_prompt() and the template wrapper functions from here.
prompts.py is kept unchanged as the authoritative default text reference.
"""
from apps.agents.prompts import (
    SCRIBE_SYSTEM, SCRIBE_FOLLOWUP, SCRIBE_SUMMARY, SCRIBE_RUSSIAN,
    SERVICE_AGENT_SYSTEM, SERVICE_AGENT_PROMPT,
    SCHEDULER_SYSTEM, SCHEDULER_REMINDER_48HR,
    CHAT_SYSTEM, MEETING_NOTES_SYSTEM,
    NEXT_MEETING_SYSTEM, MEMORY_EXTRACTION_SYSTEM, ACTION_ITEMS_SYSTEM,
)

# ── Template strings extracted from the f-string function bodies in prompts.py ──
# {transcript} is used without a slice — callers pre-truncate before .format()

_MEETING_NOTES_USER = """Analyze this {meeting_type} meeting transcript for client {client_name} and produce structured meeting notes.

Return ONLY a valid JSON object with this exact structure:
{{
  "summary": "2-3 sentence overview of the meeting",
  "key_points": ["point 1", "point 2", ...],
  "decisions": ["decision 1", ...],
  "action_items": [
    {{"owner": "advisor", "task": "description", "due": "YYYY-MM-DD or null"}},
    {{"owner": "client", "task": "description", "due": "YYYY-MM-DD or null"}}
  ]
}}

Transcript:
{transcript}"""

_NEXT_MEETING_USER = """Review this meeting transcript and determine if a next meeting was scheduled or discussed.

Today's date: {today}

Return ONLY a valid JSON object:
{{
  "needs_date": true/false,
  "meeting_agreed": true/false,
  "proposed_date": "ISO 8601 datetime or null",
  "duration_min": 60,
  "meeting_type": "Discovery|LEAP Process|Implementation|Solera Heartbeat|30-Day Check-In|Other",
  "platform": "zoom",
  "subject": "meeting subject line",
  "body": "brief meeting invite body text (2-3 sentences)",
  "attendees": [
    {{"name": "{client_name}", "email": "{client_email}"}},
    {{"name": "{advisor_name}", "email": "{advisor_email}"}}
  ]
}}

Set needs_date=true if no specific date was agreed. Set meeting_agreed=false if no next meeting was mentioned at all.

Transcript:
{transcript}"""

_MEMORY_USER = """Extract key facts about client {client_name} from this meeting transcript.

Existing known facts:
{existing_str}

Return ONLY a valid JSON object with key-value pairs. Keys should be snake_case identifiers like:
risk_tolerance, investment_goals, family_situation, income_range, insurance_needs, concerns,
retirement_timeline, current_products, health_notes, language_preference, etc.

Only include facts explicitly mentioned. Update existing facts if new information was provided.
Maximum 10 key-value pairs.

{{
  "risk_tolerance": "conservative",
  "family_situation": "married with 2 college-age children"
}}

Transcript:
{transcript}"""

_ACTION_USER = """Extract concrete action items from this financial advisory meeting with client {client_name}.

Today: {today}

Return ONLY a valid JSON object:
{{
  "tasks": [
    {{"owner": "advisor", "task": "Send Penn Mutual illustration to client", "due": "YYYY-MM-DD or null"}},
    {{"owner": "client", "task": "Gather last 3 years of tax returns", "due": "YYYY-MM-DD or null"}}
  ]
}}

Only include tasks that were explicitly mentioned or agreed upon. Both advisor and client tasks.

Transcript:
{transcript}"""

_CHAT_BASE = (
    "You are a knowledgeable AI assistant for Solera Financial Advisory, "
    "supporting advisors Vlad and Slava. "
    "You think and respond aligned with the Solera philosophy and the LEAP financial model. "
    "You never give advice that contradicts Solera's approach to protection, savings, "
    "growth, cash flow, and debt. Be concise, professional, and advisor-focused."
)

# ── Master defaults dict ─────────────────────────────────────────────────────

PROMPT_DEFAULTS: dict[str, str] = {
    "scribe_system":            SCRIBE_SYSTEM,
    "scribe_followup":          SCRIBE_FOLLOWUP,
    "scribe_summary":           SCRIBE_SUMMARY,
    "scribe_russian":           SCRIBE_RUSSIAN,
    "service_agent_system":     SERVICE_AGENT_SYSTEM,
    "service_agent_prompt":     SERVICE_AGENT_PROMPT,
    "scheduler_system":         SCHEDULER_SYSTEM,
    "scheduler_reminder_48hr":  SCHEDULER_REMINDER_48HR,
    "chat_system":              CHAT_SYSTEM,
    "chat_system_base":         _CHAT_BASE,
    "meeting_notes_system":     MEETING_NOTES_SYSTEM,
    "meeting_notes_user":       _MEETING_NOTES_USER,
    "next_meeting_system":      NEXT_MEETING_SYSTEM,
    "next_meeting_user":        _NEXT_MEETING_USER,
    "memory_extraction_system": MEMORY_EXTRACTION_SYSTEM,
    "memory_extraction_user":   _MEMORY_USER,
    "action_items_system":      ACTION_ITEMS_SYSTEM,
    "action_items_user":        _ACTION_USER,
}


def get_prompt(key: str) -> str:
    """Return DB content if present; fall back to PROMPT_DEFAULTS. Never raises."""
    from apps.agents.models import AgentPrompt  # lazy — avoids app-registry circular on import
    try:
        obj = AgentPrompt.objects.filter(key=key).first()
        return obj.content if obj else PROMPT_DEFAULTS.get(key, "")
    except Exception:
        return PROMPT_DEFAULTS.get(key, "")


# ── Template wrapper functions (identical signatures to prompts.py functions) ─

def meeting_notes_user_prompt(transcript: str, client_name: str, meeting_type: str) -> str:
    return get_prompt("meeting_notes_user").format(
        client_name=client_name,
        meeting_type=meeting_type,
        transcript=transcript[:8000],
    )


def next_meeting_user_prompt(
    transcript: str,
    client_name: str,
    client_email: str,
    advisor_name: str,
    advisor_email: str,
    today: str,
) -> str:
    return get_prompt("next_meeting_user").format(
        today=today,
        client_name=client_name,
        client_email=client_email,
        advisor_name=advisor_name,
        advisor_email=advisor_email,
        transcript=transcript[:6000],
    )


def memory_extraction_user_prompt(
    transcript: str, client_name: str, existing_memory: dict
) -> str:
    existing_str = (
        "\n".join(f"  {k}: {v}" for k, v in existing_memory.items())
        if existing_memory else "  (none yet)"
    )
    return get_prompt("memory_extraction_user").format(
        client_name=client_name,
        existing_str=existing_str,
        transcript=transcript[:6000],
    )


def action_items_user_prompt(transcript: str, client_name: str, today: str) -> str:
    return get_prompt("action_items_user").format(
        client_name=client_name,
        today=today,
        transcript=transcript[:6000],
    )
