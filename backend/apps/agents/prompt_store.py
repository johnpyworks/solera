"""
DB-backed prompt store.
Agent files import get_prompt() and the template wrapper functions from here.
prompts.py is kept unchanged as the authoritative default text reference.
"""
from apps.agents.prompts import (
    SCRIBE_SYSTEM, SCRIBE_FOLLOWUP, SCRIBE_RUSSIAN,
    SERVICE_AGENT_SYSTEM, SERVICE_AGENT_PROMPT,
    SCHEDULER_SYSTEM, SCHEDULER_REMINDER_48HR,
    CHAT_SYSTEM,
    NEXT_MEETING_SYSTEM, MEMORY_EXTRACTION_SYSTEM,
    WIKI_CLASSIFIER_SYSTEM, WIKI_CLASSIFIER_USER,
    WIKI_ARTICLE_SYSTEM, WIKI_ARTICLE_USER,
    WIKI_INDEX_SYSTEM, WIKI_INDEX_USER,
    MEETING_PREP_SELECTOR_SYSTEM, MEETING_PREP_SELECTOR_USER,
    MEETING_PREP_BRIEF_SYSTEM, MEETING_PREP_BRIEF_USER,
)

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
  "subject": "e.g. 'LEAP Process Meeting — {client_name}'",
  "body": "A warm, professional 1-2 sentence note for the calendar invite body. Do NOT mention any specific date or time — that is handled by the invite itself. Do NOT ask when to meet. Write something like: 'Looking forward to our [meeting_type] meeting. Please reach out if you have any questions before we connect.' Tone: advisor-voice, Solera brand. Plain text only.",
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

_CHAT_BASE = (
    "You are a knowledgeable AI assistant for Solera Financial Advisory, "
    "supporting advisors Vlad and Slava. "
    "You think and respond aligned with the Solera philosophy and the LEAP financial model. "
    "You never give advice that contradicts Solera's approach to protection, savings, "
    "growth, cash flow, and debt. Be concise, professional, and advisor-focused.\n\n"
    "You have full visibility into the Approval Queue — the current pending items are always "
    "provided to you as context. When an advisor says they cannot see an item, check the "
    "pending count and list in your context and refer them to it directly. "
    "Never say you cannot access or view the Approval Queue."
)

# ── Master defaults dict ─────────────────────────────────────────────────────

PROMPT_DEFAULTS: dict[str, str] = {
    "scribe_system":            SCRIBE_SYSTEM,
    "scribe_followup":          SCRIBE_FOLLOWUP,
    "scribe_russian":           SCRIBE_RUSSIAN,
    "service_agent_system":     SERVICE_AGENT_SYSTEM,
    "service_agent_prompt":     SERVICE_AGENT_PROMPT,
    "scheduler_system":         SCHEDULER_SYSTEM,
    "scheduler_reminder_48hr":  SCHEDULER_REMINDER_48HR,
    "chat_system":              CHAT_SYSTEM,
    "chat_system_base":         _CHAT_BASE,
    "next_meeting_system":      NEXT_MEETING_SYSTEM,
    "next_meeting_user":        _NEXT_MEETING_USER,
    "memory_extraction_system": MEMORY_EXTRACTION_SYSTEM,
    "memory_extraction_user":   _MEMORY_USER,
    "wiki_classifier_system":   WIKI_CLASSIFIER_SYSTEM,
    "wiki_classifier_user":     WIKI_CLASSIFIER_USER,
    "wiki_article_system":      WIKI_ARTICLE_SYSTEM,
    "wiki_article_user":        WIKI_ARTICLE_USER,
    "wiki_index_system":        WIKI_INDEX_SYSTEM,
    "wiki_index_user":          WIKI_INDEX_USER,
    "meeting_prep_article_selector_system": MEETING_PREP_SELECTOR_SYSTEM,
    "meeting_prep_article_selector_user":   MEETING_PREP_SELECTOR_USER,
    "meeting_prep_brief_system":            MEETING_PREP_BRIEF_SYSTEM,
    "meeting_prep_brief_user":              MEETING_PREP_BRIEF_USER,
}


def get_prompt(key: str) -> str:
    """Return DB content if present; fall back to PROMPT_DEFAULTS. Never raises."""
    from apps.agents.models import AgentPrompt  # lazy — avoids app-registry circular on import
    try:
        obj = AgentPrompt.objects.filter(key=key).first()
        return obj.content if obj else PROMPT_DEFAULTS.get(key, "")
    except Exception:
        return PROMPT_DEFAULTS.get(key, "")


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


