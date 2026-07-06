"""AudienceAgent — builds audience segments from the approved strategy plan.

Per architecture plan Section 3.1:
  Model: claude-sonnet-5 (platform APIs + privacy nuance)
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.5/5
  Hard minimum: 2.5/5
  Max iterations: 2
  Dimensions: strategy_alignment, privacy_safety, size_viability, segment_distinctness

Pre-checks (rule-based, run before LLM):
  - strategy output must be present in upstream_outputs
  - strategy must have at least 1 channel defined
  - strategy budget_media_cents > 0
  - estimated audience size must be >= 1000 (validated post-output, not pre-check)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import AudienceOutput

logger = logging.getLogger(__name__)

AUDIENCE_SYSTEM_PROMPT = """\
You are the Audience Agent for CampaignOS, an AI-native marketing operating system.
Your role is to translate an approved campaign strategy into a precise, actionable audience plan.

Guidelines:
- Segments must be mutually exclusive and collectively exhaustive for the target population.
- All rule conditions must reference real customer attributes: loyalty_tier, lifetime_value_cents,
  days_since_last_purchase, preferred_banner_id, age_band, has_children, zip_code, digital_enrolled,
  purchase_category_last_90d.
- Estimated sizes must be realistic for a 500-store regional campaign (10K–5M range).
- Privacy risk: HIGH if rules use sensitive attributes (health, financial distress, religion).
  MEDIUM if rules use indirect proxies. LOW otherwise.
- Suppression rules must always exclude: opted_out_email, opted_out_sms, recently_churned (0 purchase
  in 24+ months), and do_not_contact lists.
- channel_size_estimates must cover every channel in the strategy's channel_mix.
- Rationale must explain why this segmentation maximizes campaign effectiveness.

You MUST respond with ONLY a valid JSON object matching the AudienceOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

AudienceOutput schema:
{schema}
"""


class AudienceAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "audience"

    @property
    def output_schema(self) -> type[BaseModel]:
        return AudienceOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "strategy_alignment",
            "privacy_safety",
            "size_viability",
            "segment_distinctness",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-sonnet-5",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=2,
            score_threshold=3.5,
            hard_minimum_score=2.5,
            per_run_token_budget=10_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — AudienceAgent requires approved strategy",
                check_name="strategy_required",
            )

        channels = strategy.get("channel_mix", {}).get("channels", [])
        if not channels:
            raise PreCheckError(
                "Strategy has no channels defined — cannot build channel size estimates",
                check_name="channels_required",
            )

        budget = strategy.get("budget_media_cents", 0)
        if budget <= 0:
            logger.warning(
                "AudienceAgent: strategy budget_media_cents is zero — "
                "audience sizing estimates may be unreliable"
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(AudienceOutput.model_json_schema(), indent=2)
        system = AUDIENCE_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})
        past_lessons = input.upstream_outputs.get("past_lessons", [])

        context_parts = []

        if strategy:
            channel_list = ", ".join(strategy.get("channel_mix", {}).get("channels", []))
            context_parts.append(
                f"Approved Strategy:\n"
                f"  Objective: {strategy.get('objective', 'Not specified')}\n"
                f"  Target Market: {strategy.get('target_market', {}).get('description', '')}\n"
                f"  Segments: {', '.join(strategy.get('target_market', {}).get('segments', []))}\n"
                f"  Geography: {strategy.get('target_market', {}).get('geography', 'National')}\n"
                f"  Age Bands: {', '.join(strategy.get('target_market', {}).get('age_bands', []))}\n"
                f"  Channels: {channel_list}\n"
                f"  Budget (media): ${strategy.get('budget_media_cents', 0) / 100:,.0f}\n"
                f"  Messaging Pillars: {'; '.join(strategy.get('messaging_pillars', []))}"
            )

        if campaign_meta:
            context_parts.append(
                f"Campaign: {campaign_meta.get('name', 'Unnamed')}\n"
                f"  Division: {campaign_meta.get('division_id', 'All')}\n"
                f"  Banner: {campaign_meta.get('banner_id', 'All')}\n"
                f"  Dates: {campaign_meta.get('start_date', 'TBD')} → "
                f"{campaign_meta.get('end_date', 'TBD')}"
            )

        if past_lessons:
            lessons_str = "\n".join(f"- {l}" for l in past_lessons[:5])
            context_parts.append(
                f"Relevant lessons from similar past campaigns:\n{lessons_str}"
            )

        user_content = (
            "Build a complete audience plan for the following campaign strategy:\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON audience plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Ensure standard suppression rules are always present."""
        standard_suppressions = [
            "opted_out_email",
            "opted_out_sms",
            "do_not_contact",
        ]
        existing_reasons = {
            s.get("reason", "") for s in output.get("suppression_rules", [])
        }
        for reason in standard_suppressions:
            if reason not in existing_reasons:
                output.setdefault("suppression_rules", []).append({
                    "reason": reason,
                    "rule": {
                        "logic": "AND",
                        "conditions": [
                            {"field": reason, "operator": "EQ", "value": True}
                        ],
                        "sub_groups": [],
                    },
                })
        return output
