"""Service Agent — extracts Wealthbox tasks from LEAP meeting notes."""
import json
from datetime import date

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompts import SERVICE_AGENT_SYSTEM, SERVICE_AGENT_PROMPT
from apps.approvals.models import ApprovalItem
from apps.meetings.models import Meeting
from apps.settings_app.models import AdvisorSettings


def run(meeting_id: str) -> dict:
    """Extract tasks from LEAP/Implementation meeting notes."""
    try:
        meeting = Meeting.objects.select_related("client", "owner").get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return {"error": f"Meeting {meeting_id} not found"}

    if meeting.meeting_type not in ("LEAP Process", "Implementation"):
        return {"skipped": "Not a LEAP or Implementation meeting"}

    settings = AdvisorSettings.get()
    if not settings.toggle_wealthbox_task:
        return {"skipped": "Wealthbox tasks disabled in settings"}

    client = meeting.client
    notes = meeting.leap_notes_text or meeting.transcript_text
    if not notes:
        return {"error": "No notes to extract tasks from"}

    ai = AIProvider()
    prompt = SERVICE_AGENT_PROMPT.format(
        client_name=client.name,
        notes=notes[:3000],
        today=str(date.today()),
    )

    raw = ai.complete(system_prompt=SERVICE_AGENT_SYSTEM, user_prompt=prompt)

    # Parse JSON from response
    import re
    match = re.search(r'\[.*\]', raw, re.DOTALL)
    tasks = []
    if match:
        try:
            tasks = json.loads(match.group())
        except json.JSONDecodeError:
            tasks = [{"title": raw[:200], "due": str(date.today()), "priority": "medium"}]
    else:
        tasks = [{"title": raw[:200], "due": str(date.today()), "priority": "medium"}]

    item = ApprovalItem.objects.create(
        owner=meeting.owner,
        item_type="wealthbox_task",
        client=client,
        client_name=client.name,
        agent="Service Agent",
        draft_content={"tasks": tasks},
    )

    AgentLog.objects.create(
        agent_name="Service Agent",
        action=f"Extracted {len(tasks)} Wealthbox task(s) from {meeting.meeting_type} notes",
        client=client,
        client_name=client.name,
        status="complete",
        output_data={"approval_id": str(item.id), "task_count": len(tasks)},
    )

    return {"tasks": tasks, "approval_id": str(item.id)}
