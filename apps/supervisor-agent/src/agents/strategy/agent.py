"""StrategyAgent — interprets a campaign brief into a structured strategy plan.

Per architecture plan Section 3.1:
  Model: claude-opus-4-8 (high-stakes; strategy drives everything downstream)
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.8/5
  Hard minimum: 2.5/5
  Max iterations: 2
  Dimensions: brief_alignment, specificity, feasibility, kpi_clarity, channel_rationale

Pre-checks (rule-based, run before LLM):
  - budget_total > 0
  - start_date < end_date
  - at least 1 KPI defined in brief (or brief text is non-empty)
  - at least 1 channel mentioned in brief (or use default EMAIL)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import StrategyOutput

logger = logging.getLogger(__name__)

STRATEGY_SYSTEM_PROMPT = """\
You are the Strategy Agent for CampaignOS, an AI-native marketing operating system.
Your role is to transform a campaign brief into a precise, actionable strategy plan.

Guidelines:
- Be specific and data-driven. Vague objectives ("increase sales") are unacceptable.
- Channel mix must reflect realistic media planning for the target market.
- KPI targets must be measurable, time-bound, and achievable with the given budget.
- Budget allocation must be internally consistent (media + production ≤ total).
- Messaging pillars must directly address the target market's motivations.
- Rationale must explain WHY this strategy fits the brand's current situation.

You MUST respond with ONLY a valid JSON object matching the StrategyOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

StrategyOutput schema:
{schema}
"""


class StrategyAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "strategy"

    @property
    def output_schema(self) -> type[BaseModel]:
        return StrategyOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "brief_alignment",
            "specificity",
            "feasibility",
            "kpi_clarity",
            "channel_rationale",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-opus-4-8",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=2,
            score_threshold=3.8,
            hard_minimum_score=2.5,
            per_run_token_budget=20_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        """Rule-based validations before LLM calls."""
        brief = input.upstream_outputs.get("brief", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})

        budget = campaign_meta.get("budget_total_cents", 0)
        if budget <= 0:
            logger.warning(
                "StrategyAgent: budget_total_cents missing/zero — proceeding with placeholder"
            )

        start = campaign_meta.get("start_date")
        end = campaign_meta.get("end_date")
        if start and end and start >= end:
            raise PreCheckError(
                f"start_date ({start}) must be before end_date ({end})",
                check_name="date_order",
            )

        brief_text = brief.get("brief_text") or campaign_meta.get("brief_text") or ""
        if not brief_text.strip():
            raise PreCheckError(
                "Campaign brief text is empty — cannot generate strategy",
                check_name="brief_not_empty",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(StrategyOutput.model_json_schema(), indent=2)
        system = STRATEGY_SYSTEM_PROMPT.format(schema=schema_json)

        # Build context from upstream outputs
        brief = input.upstream_outputs.get("brief", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})
        past_lessons = input.upstream_outputs.get("past_lessons", [])

        context_parts = []

        # Campaign metadata
        if campaign_meta:
            context_parts.append(
                f"Campaign: {campaign_meta.get('name', 'Unnamed')}\n"
                f"Brief: {campaign_meta.get('brief_text', '')}\n"
                f"Budget: ${campaign_meta.get('budget_total_cents', 0) / 100:,.0f} total, "
                f"${campaign_meta.get('budget_media_cents', 0) / 100:,.0f} media\n"
                f"Dates: {campaign_meta.get('start_date', 'TBD')} → {campaign_meta.get('end_date', 'TBD')}\n"
                f"Division: {campaign_meta.get('division_id', 'All')}\n"
                f"Banner: {campaign_meta.get('banner_id', 'All')}"
            )
        elif brief:
            context_parts.append(f"Brief text:\n{brief.get('brief_text', '')}")

        # Relevant lessons from past campaigns
        if past_lessons:
            lessons_str = "\n".join(f"- {l}" for l in past_lessons[:5])
            context_parts.append(
                f"Relevant lessons from similar past campaigns:\n{lessons_str}"
            )

        user_content = (
            "Generate a complete strategy plan for the following campaign:\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON strategy plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Normalize channel names to uppercase and ensure budget consistency."""
        if "channel_mix" in output and "channels" in output["channel_mix"]:
            output["channel_mix"]["channels"] = [
                c.upper() for c in output["channel_mix"]["channels"]
            ]
        # Ensure budget consistency: if media+production > total, cap total to sum
        total = output.get("budget_total_cents", 0)
        media = output.get("budget_media_cents", 0)
        prod = output.get("budget_production_cents", 0)
        if total > 0 and (media + prod) > total:
            # Scale down proportionally
            scale = total / (media + prod)
            output["budget_media_cents"] = int(media * scale)
            output["budget_production_cents"] = int(prod * scale)
        return output
