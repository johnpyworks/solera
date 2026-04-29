"""Meeting Prep Agent — generates a structured advisor brief before a client meeting.

Flow:
  1. Load the client's wiki index (compact overview of all articles)
  2. AI selects which article types are most relevant for this meeting type
  3. Load the full body of selected articles (is_latest=True priority)
  4. AI generates a structured prep brief in markdown
  5. Return brief text (displayed inline — never goes to approval queue)
"""
from apps.agents.provider import AIProvider
from apps.agents.prompt_store import get_prompt
from apps.agents.models import AgentLog


def run(client_id: str, meeting_type: str = "", advisor_focus: str = "") -> dict:
    """
    Generate a meeting prep brief for a client.

    Args:
        client_id: UUID of the client
        meeting_type: e.g. "Annual Review", "LEAP Process", "Discovery"
        advisor_focus: optional free-text focus area from the advisor (e.g. "insurance only")

    Returns:
        {"brief": "<markdown>", "articles_used": [...], "client_name": "..."}
    """
    from apps.clients.models import Client, ClientWikiArticle, ClientWikiIndex

    try:
        client = Client.objects.select_related("owner").get(pk=client_id)
    except Client.DoesNotExist:
        return {"error": f"Client {client_id} not found"}

    # 1. Load wiki index
    try:
        wiki_index = client.wiki_index.body
    except ClientWikiIndex.DoesNotExist:
        wiki_index = "(No documents have been uploaded for this client yet.)"

    # 2. Load open tasks for context
    from apps.clients.models import ClientTask
    open_tasks = ClientTask.objects.filter(client=client, status="open").order_by("due_date")
    tasks_str = "\n".join(
        f"- [{t.owner}] {t.title}" + (f" — due {t.due_date}" if t.due_date else "")
        for t in open_tasks
    ) or "(none)"

    ai = AIProvider()

    # Create log before AI calls so costs can be linked
    log = AgentLog.objects.create(
        agent_name="MeetingPrepAgent",
        task_label="Meeting prep brief",
        action=f"Generating prep brief for {client.name} ({meeting_type or 'general'})",
        client=client,
        client_name=client.name,
        status="running",
    )

    # 3. AI selects which articles to load
    selection_prompt = (
        get_prompt("meeting_prep_article_selector_user")
        .replace("{client_name}", client.name)
        .replace("{meeting_type}", meeting_type or "general")
        .replace("{advisor_focus}", advisor_focus or "full prep")
        .replace("{wiki_index}", wiki_index)
    )

    selection_result = ai.complete(
        system_prompt=get_prompt("meeting_prep_article_selector_system"),
        user_prompt=selection_prompt,
        agent_log=log,
    )

    import json, re
    selected_types = []
    match = re.search(r'\[.*?\]', selection_result["text"], re.DOTALL)
    if match:
        try:
            selected_types = json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Default to all types if selection failed
    if not selected_types:
        selected_types = ["leap_position", "life_insurance", "investment_accounts",
                          "annual_review", "client_background", "meeting_history"]

    # 4. Load selected articles (latest first, fall back to any if no latest)
    articles = []
    articles_used = []
    for article_type in selected_types:
        article = (
            ClientWikiArticle.objects.filter(client=client, article_type=article_type, is_latest=True).first()
            or ClientWikiArticle.objects.filter(client=client, article_type=article_type).order_by("-last_updated").first()
        )
        if article:
            articles.append(f"## {article.title}\n\n{article.body}")
            articles_used.append({"type": article_type, "title": article.title})

    articles_str = "\n\n---\n\n".join(articles) if articles else "(No relevant articles found.)"

    # 5. Generate the prep brief
    advisor_focus_section = (
        f"Advisor focus: {advisor_focus}\n" if advisor_focus else ""
    )

    brief_result = ai.complete(
        system_prompt=get_prompt("meeting_prep_brief_system"),
        user_prompt=(
            get_prompt("meeting_prep_brief_user")
            .replace("{client_name}", client.name)
            .replace("{meeting_type}", meeting_type or "meeting")
            .replace("{advisor_focus_section}", advisor_focus_section)
            .replace("{open_tasks}", tasks_str)
            .replace("{articles}", articles_str[:12000])
        ),
        agent_log=log,
    )

    brief = brief_result["text"].strip()

    log.status = "complete"
    log.action = f"Generated prep brief for {client.name} ({meeting_type or 'general'})"
    log.output_data = {"articles_used": articles_used, "article_count": len(articles_used)}
    log.save(update_fields=["status", "action", "output_data"])

    return {
        "brief": brief,
        "articles_used": articles_used,
        "client_name": client.name,
    }
