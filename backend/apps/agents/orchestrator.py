"""Orchestrator — routes intents to the appropriate agent."""
from apps.agents.models import AgentLog


def route(intent: str, **kwargs) -> dict:
    """
    intent: 'process_meeting' | 'queue_reminder' | 'generate_weekly_summary'
    kwargs: meeting_id, reminder_type, etc.
    """
    AgentLog.objects.create(
        agent_name="Orchestrator",
        action=f"Routing intent: {intent} {kwargs}",
        client_id=kwargs.get("client_id"),
        client_name=kwargs.get("client_name", ""),
        status="running",
        input_data={"intent": intent, **kwargs},
    )

    result = {}

    if intent == "process_meeting":
        meeting_id = kwargs["meeting_id"]
        from apps.agents import scribe, service_agent
        scribe_result = scribe.run(meeting_id)
        sa_result = service_agent.run(meeting_id)
        result = {"scribe": scribe_result, "service_agent": sa_result}

    elif intent == "queue_reminder":
        from apps.agents import scheduler
        result = scheduler.check_and_queue_reminders()

    elif intent == "generate_weekly_summary":
        result = {"detail": "Weekly summary generation queued."}

    else:
        result = {"error": f"Unknown intent: {intent}"}

    AgentLog.objects.filter(
        agent_name="Orchestrator",
        action__startswith=f"Routing intent: {intent}",
        status="running",
    ).update(status="complete", output_data=result)

    return result
