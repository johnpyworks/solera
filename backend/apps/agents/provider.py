"""
AIProvider — single interface for Anthropic Claude and OpenAI GPT.
Reads provider + model from AdvisorSettings at call time; no restart needed to switch.

complete() returns {"text": str, "usage": dict} where usage has keys:
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
"""
from django.conf import settings


class AIProvider:
    def complete(self, system_prompt: str, user_prompt: str, agent_log=None) -> dict:
        from apps.settings_app.models import AdvisorSettings
        cfg = AdvisorSettings.get()
        provider = cfg.ai_provider
        model = cfg.ai_model

        if provider == "openai":
            result = self._openai(model, system_prompt, user_prompt)
        else:
            result = self._anthropic(model, system_prompt, user_prompt)

        self._save_cost(result, agent_log)
        return result

    def _anthropic(self, model: str, system_prompt: str, user_prompt: str) -> dict:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=model or "claude-sonnet-4-6",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        usage = {
            "input_tokens": msg.usage.input_tokens,
            "output_tokens": msg.usage.output_tokens,
            "cache_read_tokens": getattr(msg.usage, "cache_read_input_tokens", 0) or 0,
            "cache_write_tokens": getattr(msg.usage, "cache_creation_input_tokens", 0) or 0,
        }
        return {"text": msg.content[0].text, "usage": usage, "model": model or "claude-sonnet-4-6"}

    def _openai(self, model: str, system_prompt: str, user_prompt: str) -> dict:
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
        usage = resp.usage
        usage_dict = {
            "input_tokens": usage.prompt_tokens if usage else 0,
            "output_tokens": usage.completion_tokens if usage else 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
        }
        return {"text": resp.choices[0].message.content, "usage": usage_dict, "model": model or "gpt-4o"}

    def _save_cost(self, result: dict, agent_log=None):
        try:
            from apps.agents.models import AgentSessionCost
            usage = result.get("usage", {})
            model = result.get("model", "")

            input_tokens = usage.get("input_tokens", 0) or 0
            output_tokens = usage.get("output_tokens", 0) or 0
            cache_read_tokens = usage.get("cache_read_tokens", 0) or 0
            cache_write_tokens = usage.get("cache_write_tokens", 0) or 0

            # Pricing per model family
            if "claude" in model.lower():
                # Claude Sonnet 4.6: $3.00/1M input, $15.00/1M output, $0.30/1M cache read
                input_cost  = input_tokens       * 3.00  / 1_000_000
                output_cost = output_tokens      * 15.00 / 1_000_000
                cache_read_cost  = cache_read_tokens  * 0.30  / 1_000_000
                cache_write_cost = cache_write_tokens * 3.75  / 1_000_000
            else:
                # OpenAI defaults: $2.50/1M input, $10.00/1M output
                input_cost  = input_tokens  * 2.50  / 1_000_000
                output_cost = output_tokens * 10.00 / 1_000_000
                cache_read_cost  = 0
                cache_write_cost = 0

            cost_usd = input_cost + output_cost + cache_read_cost + cache_write_cost

            AgentSessionCost.objects.create(
                agent_log=agent_log,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                cost_usd=round(cost_usd, 6),
            )
        except Exception:
            # Never let cost tracking break the main flow
            pass
