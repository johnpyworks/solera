from django.apps import AppConfig


class AgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.agents"

    def ready(self):
        try:
            from django.db import connection
            if "agents_agentprompt" not in connection.introspection.table_names():
                return
            from apps.agents.prompt_store import PROMPT_DEFAULTS
            from apps.agents.models import AgentPrompt
            for key, content in PROMPT_DEFAULTS.items():
                AgentPrompt.objects.filter(key=key).update(content=content)
        except Exception:
            pass
