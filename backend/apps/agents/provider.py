"""
AIProvider — single interface for Anthropic Claude and OpenAI GPT.
Reads provider + model from AdvisorSettings at call time; no restart needed to switch.
"""
from django.conf import settings


class AIProvider:
    def complete(self, system_prompt: str, user_prompt: str) -> str:
        from apps.settings_app.models import AdvisorSettings
        cfg = AdvisorSettings.get()
        provider = cfg.ai_provider
        model = cfg.ai_model

        if provider == "openai":
            return self._openai(model, system_prompt, user_prompt)
        return self._anthropic(model, system_prompt, user_prompt)

    def _anthropic(self, model: str, system_prompt: str, user_prompt: str) -> str:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=model or "claude-sonnet-4-6",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return msg.content[0].text

    def _openai(self, model: str, system_prompt: str, user_prompt: str) -> str:
        import openai
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=model or "gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2048,
        )
        return resp.choices[0].message.content
