"""Data migration: seed 18 AgentPrompt rows from hardcoded defaults."""
from django.db import migrations


def seed_prompts(apps, schema_editor):
    AgentPrompt = apps.get_model("agents", "AgentPrompt")

    # Import the default strings directly so the migration is self-contained.
    # We cannot import from prompt_store here (it uses the ORM), so we duplicate
    # the minimal text needed. The source of truth remains prompts.py / prompt_store.py.
    from apps.agents.prompts import (
        SCRIBE_SYSTEM, SCRIBE_FOLLOWUP, SCRIBE_SUMMARY, SCRIBE_RUSSIAN,
        SERVICE_AGENT_SYSTEM, SERVICE_AGENT_PROMPT,
        SCHEDULER_SYSTEM, SCHEDULER_REMINDER_48HR,
        CHAT_SYSTEM, MEETING_NOTES_SYSTEM,
        NEXT_MEETING_SYSTEM, MEMORY_EXTRACTION_SYSTEM, ACTION_ITEMS_SYSTEM,
    )

    _CHAT_BASE = (
        "You are a knowledgeable AI assistant for Solera Financial Advisory, "
        "supporting advisors Vlad and Slava. "
        "You think and respond aligned with the Solera philosophy and the LEAP financial model. "
        "You never give advice that contradicts Solera's approach to protection, savings, "
        "growth, cash flow, and debt. Be concise, professional, and advisor-focused."
    )

    _MEETING_NOTES_USER = (
        "Analyze this {meeting_type} meeting transcript for client {client_name} and produce "
        "structured meeting notes.\n\nReturn ONLY a valid JSON object with this exact structure:\n"
        '{{\n  "summary": "2-3 sentence overview of the meeting",\n'
        '  "key_points": ["point 1", "point 2", ...],\n'
        '  "decisions": ["decision 1", ...],\n'
        '  "action_items": [\n'
        '    {{"owner": "advisor", "task": "description", "due": "YYYY-MM-DD or null"}},\n'
        '    {{"owner": "client", "task": "description", "due": "YYYY-MM-DD or null"}}\n'
        "  ]\n}}\n\nTranscript:\n{transcript}"
    )

    _NEXT_MEETING_USER = (
        "Review this meeting transcript and determine if a next meeting was scheduled or discussed.\n\n"
        "Today's date: {today}\n\n"
        "Return ONLY a valid JSON object:\n"
        '{{\n  "needs_date": true/false,\n  "meeting_agreed": true/false,\n'
        '  "proposed_date": "ISO 8601 datetime or null",\n  "duration_min": 60,\n'
        '  "meeting_type": "Discovery|LEAP Process|Implementation|Solera Heartbeat|30-Day Check-In|Other",\n'
        '  "platform": "zoom",\n  "subject": "meeting subject line",\n'
        '  "body": "brief meeting invite body text (2-3 sentences)",\n'
        '  "attendees": [\n'
        '    {{"name": "{client_name}", "email": "{client_email}"}},\n'
        '    {{"name": "{advisor_name}", "email": "{advisor_email}"}}\n'
        "  ]\n}}\n\n"
        "Set needs_date=true if no specific date was agreed. "
        "Set meeting_agreed=false if no next meeting was mentioned at all.\n\n"
        "Transcript:\n{transcript}"
    )

    _MEMORY_USER = (
        "Extract key facts about client {client_name} from this meeting transcript.\n\n"
        "Existing known facts:\n{existing_str}\n\n"
        "Return ONLY a valid JSON object with key-value pairs. Keys should be snake_case identifiers like:\n"
        "risk_tolerance, investment_goals, family_situation, income_range, insurance_needs, concerns,\n"
        "retirement_timeline, current_products, health_notes, language_preference, etc.\n\n"
        "Only include facts explicitly mentioned. Update existing facts if new information was provided.\n"
        "Maximum 10 key-value pairs.\n\n"
        '{{\n  "risk_tolerance": "conservative",\n'
        '  "family_situation": "married with 2 college-age children"\n}}\n\n'
        "Transcript:\n{transcript}"
    )

    _ACTION_USER = (
        "Extract concrete action items from this financial advisory meeting with client {client_name}.\n\n"
        "Today: {today}\n\n"
        "Return ONLY a valid JSON object:\n"
        '{{\n  "tasks": [\n'
        '    {{"owner": "advisor", "task": "Send Penn Mutual illustration to client", "due": "YYYY-MM-DD or null"}},\n'
        '    {{"owner": "client", "task": "Gather last 3 years of tax returns", "due": "YYYY-MM-DD or null"}}\n'
        "  ]\n}}\n\n"
        "Only include tasks that were explicitly mentioned or agreed upon. Both advisor and client tasks.\n\n"
        "Transcript:\n{transcript}"
    )

    PROMPTS = [
        {
            "key": "scribe_system",
            "name": "Scribe — System Prompt",
            "agent_name": "Scribe",
            "description": "Core system instructions for all Scribe agent operations. Defines the advisor voice, LEAP philosophy alignment, and approval-before-send constraint.",
            "is_template": False,
            "variables": [],
            "content": SCRIBE_SYSTEM,
        },
        {
            "key": "scribe_followup",
            "name": "Scribe — Client Follow-Up Email",
            "agent_name": "Scribe",
            "description": "Template for drafting a post-meeting client follow-up email. Written in first-person advisor voice.",
            "is_template": True,
            "variables": ["client_name", "meeting_type", "meeting_date", "notes", "client_context"],
            "content": SCRIBE_FOLLOWUP,
        },
        {
            "key": "scribe_summary",
            "name": "Scribe — Internal Advisor Summary",
            "agent_name": "Scribe",
            "description": "Template for drafting structured internal advisor notes after a meeting.",
            "is_template": True,
            "variables": ["client_name", "meeting_type", "meeting_date", "notes"],
            "content": SCRIBE_SUMMARY,
        },
        {
            "key": "scribe_russian",
            "name": "Scribe — Russian-Speaking Client Flag",
            "agent_name": "Scribe",
            "description": "Appended to the system prompt when the client's language_tag contains 'ru'. Instructs the AI to draft the email in Russian.",
            "is_template": True,
            "variables": ["client_name"],
            "content": SCRIBE_RUSSIAN,
        },
        {
            "key": "service_agent_system",
            "name": "Service Agent — System Prompt",
            "agent_name": "Service Agent",
            "description": "Core system instructions for the Service Agent. Focuses on extracting Wealthbox CRM tasks from LEAP meeting notes.",
            "is_template": False,
            "variables": [],
            "content": SERVICE_AGENT_SYSTEM,
        },
        {
            "key": "service_agent_prompt",
            "name": "Service Agent — Task Extraction Prompt",
            "agent_name": "Service Agent",
            "description": "User prompt template for extracting Wealthbox tasks from meeting notes.",
            "is_template": True,
            "variables": ["client_name", "notes", "today"],
            "content": SERVICE_AGENT_PROMPT,
        },
        {
            "key": "scheduler_system",
            "name": "Scheduler — System Prompt",
            "agent_name": "Scheduler",
            "description": "Core system instructions for the Scheduler agent. Drafts appointment reminder emails.",
            "is_template": False,
            "variables": [],
            "content": SCHEDULER_SYSTEM,
        },
        {
            "key": "scheduler_reminder_48hr",
            "name": "Scheduler — 48hr Reminder Template",
            "agent_name": "Scheduler",
            "description": "User prompt template for drafting 48-hour appointment reminder emails. Handles Russian-speaking clients.",
            "is_template": True,
            "variables": ["client_name", "meeting_type", "meeting_datetime", "location", "advisor_name", "language_tag"],
            "content": SCHEDULER_REMINDER_48HR,
        },
        {
            "key": "chat_system",
            "name": "Chat — System Prompt (advisor_name variant)",
            "agent_name": "Chat",
            "description": "System prompt used when the chat includes a specific advisor name. Contains {advisor_name} placeholder.",
            "is_template": True,
            "variables": ["advisor_name"],
            "content": CHAT_SYSTEM,
        },
        {
            "key": "chat_system_base",
            "name": "Chat — Base System Prompt",
            "agent_name": "Chat",
            "description": "Base system prompt used for all regular advisor chat conversations (no advisor_name placeholder).",
            "is_template": False,
            "variables": [],
            "content": _CHAT_BASE,
        },
        {
            "key": "meeting_notes_system",
            "name": "Meeting Notes — System Prompt",
            "agent_name": "Scribe",
            "description": "System prompt for producing structured meeting notes from a transcript.",
            "is_template": False,
            "variables": [],
            "content": MEETING_NOTES_SYSTEM,
        },
        {
            "key": "meeting_notes_user",
            "name": "Meeting Notes — User Prompt Template",
            "agent_name": "Scribe",
            "description": "User prompt template for structured meeting notes extraction. Returns JSON.",
            "is_template": True,
            "variables": ["meeting_type", "client_name", "transcript"],
            "content": _MEETING_NOTES_USER,
        },
        {
            "key": "next_meeting_system",
            "name": "Next Meeting — System Prompt",
            "agent_name": "Scribe",
            "description": "System prompt for extracting next meeting scheduling details from a transcript.",
            "is_template": False,
            "variables": [],
            "content": NEXT_MEETING_SYSTEM,
        },
        {
            "key": "next_meeting_user",
            "name": "Next Meeting — User Prompt Template",
            "agent_name": "Scribe",
            "description": "User prompt template for determining if a next meeting was scheduled. Returns JSON calendar event.",
            "is_template": True,
            "variables": ["today", "client_name", "client_email", "advisor_name", "advisor_email", "transcript"],
            "content": _NEXT_MEETING_USER,
        },
        {
            "key": "memory_extraction_system",
            "name": "Memory Extraction — System Prompt",
            "agent_name": "Scribe",
            "description": "System prompt for extracting key client facts from a meeting transcript.",
            "is_template": False,
            "variables": [],
            "content": MEMORY_EXTRACTION_SYSTEM,
        },
        {
            "key": "memory_extraction_user",
            "name": "Memory Extraction — User Prompt Template",
            "agent_name": "Scribe",
            "description": "User prompt template for client memory extraction. Returns JSON key-value facts.",
            "is_template": True,
            "variables": ["client_name", "existing_str", "transcript"],
            "content": _MEMORY_USER,
        },
        {
            "key": "action_items_system",
            "name": "Action Items — System Prompt",
            "agent_name": "Scribe",
            "description": "System prompt for extracting actionable tasks for advisor and client from a meeting transcript.",
            "is_template": False,
            "variables": [],
            "content": ACTION_ITEMS_SYSTEM,
        },
        {
            "key": "action_items_user",
            "name": "Action Items — User Prompt Template",
            "agent_name": "Scribe",
            "description": "User prompt template for action item extraction. Returns JSON tasks array.",
            "is_template": True,
            "variables": ["client_name", "today", "transcript"],
            "content": _ACTION_USER,
        },
    ]

    for p in PROMPTS:
        AgentPrompt.objects.get_or_create(key=p["key"], defaults=p)


def unseed_prompts(apps, schema_editor):
    AgentPrompt = apps.get_model("agents", "AgentPrompt")
    AgentPrompt.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0004_agentprompt"),
    ]

    operations = [
        migrations.RunPython(seed_prompts, reverse_code=unseed_prompts),
    ]
