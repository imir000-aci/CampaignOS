"""CreativeAgent — generates copy variants for all campaign channels (copy only).

Per architecture plan Section 3.1:
  Model: claude-sonnet-5 (creative quality requires capable model)
  Critique model: claude-sonnet-5 (brand nuance — haiku insufficient)
  Score threshold: 4.0/5
  Hard minimum: 3.0/5
  Max iterations: 2
  Dimensions: brand_compliance, copy_clarity, cta_strength, channel_appropriateness

  Note: Image generation (Gemini) wired in Phase 4b Step 10. This agent handles copy only.

Pre-checks:
  - strategy must be present with at least 1 messaging pillar
  - audience must be present
  - channel_mix must have at least 1 channel
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import CHANNEL_COPY_SPECS, CreativeOutput

logger = logging.getLogger(__name__)

CREATIVE_SYSTEM_PROMPT = """\
You are the Creative Agent for CampaignOS, an AI-native marketing operating system.
Your role is to generate high-quality, brand-safe copy variants for every channel in the campaign.

Guidelines:
- Generate 2-3 variants per channel — each addressing a DIFFERENT messaging pillar.
- Each variant must have: variant_key (snake_case), channel, headline, body_copy, cta_text,
  messaging_pillar_ref, tone.
- Channel copy specifications (maximum limits):
  EMAIL:       headline ≤ 50 chars, body ≤ 200 words, CTA ≤ 8 words
  PAID_SOCIAL: headline ≤ 40 chars, body ≤ 125 words, CTA ≤ 5 words
  SMS:         entire message ≤ 160 chars total (headline + body + CTA combined)
  PUSH:        headline ≤ 40 chars, body ≤ 100 chars, CTA ≤ 4 words
  DISPLAY:     headline ≤ 30 chars, body ≤ 90 chars, CTA ≤ 4 words
- Brand compliance: no competitor mentions, no unsubstantiated superlatives ("best ever"),
  no urgency fabrication ("only 2 left!"), no health/medical claims.
- Tone must match the target market: loyalty members expect respect and value, not hype.
- CTA must be specific and action-oriented: "Shop the Deals", "Redeem Your Reward",
  not generic "Click Here".
- variant_key format: {{channel_lower}}_{{pillar_short}}_{{v1/v2/v3}}
  Example: email_premium_grilling_v1

You MUST respond with ONLY a valid JSON object matching the CreativeOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

CreativeOutput schema:
{schema}
"""


class CreativeAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "creative"

    @property
    def output_schema(self) -> type[BaseModel]:
        return CreativeOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "brand_compliance",
            "copy_clarity",
            "cta_strength",
            "channel_appropriateness",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-sonnet-5",
            critique_model="claude-sonnet-5",
            max_iterations=2,
            score_threshold=4.0,
            hard_minimum_score=3.0,
            per_run_token_budget=15_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}
        audience = input.upstream_outputs.get("audience") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — CreativeAgent requires approved strategy",
                check_name="strategy_required",
            )

        pillars = strategy.get("messaging_pillars", [])
        if not pillars:
            raise PreCheckError(
                "Strategy has no messaging pillars — cannot generate copy variants",
                check_name="messaging_pillars_required",
            )

        if not audience:
            raise PreCheckError(
                "Audience output is missing — CreativeAgent requires computed audience",
                check_name="audience_required",
            )

        channels = strategy.get("channel_mix", {}).get("channels", [])
        if not channels:
            raise PreCheckError(
                "Strategy has no channels — cannot generate channel-specific copy",
                check_name="channels_required",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(CreativeOutput.model_json_schema(), indent=2)
        system = CREATIVE_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        audience = input.upstream_outputs.get("audience", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})
        past_lessons = input.upstream_outputs.get("past_lessons", [])

        context_parts = []

        if strategy:
            pillars = strategy.get("messaging_pillars", [])
            pillar_list = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(pillars))
            channels = strategy.get("channel_mix", {}).get("channels", [])
            context_parts.append(
                f"Campaign Strategy:\n"
                f"  Objective: {strategy.get('objective', '')}\n"
                f"  Channels: {', '.join(channels)}\n"
                f"  Messaging Pillars:\n{pillar_list}\n"
                f"  Target Market: {strategy.get('target_market', {}).get('description', '')}\n"
                f"  Age Bands: {', '.join(strategy.get('target_market', {}).get('age_bands', []))}"
            )

        if audience:
            segments_str = "; ".join(
                f"{s['segment_key']}: {s.get('name', '')}" for s in audience.get("segments", [])
            )
            context_parts.append(
                f"Audience Segments:\n  {segments_str}\n"
                f"  Primary description: {audience.get('primary_audience_description', '')[:200]}"
            )

        if campaign_meta:
            context_parts.append(
                f"Campaign: {campaign_meta.get('name', 'Unnamed')}\n"
                f"  Banner: {campaign_meta.get('banner_id', 'All')}"
            )

        if past_lessons:
            lessons_str = "\n".join(f"  - {l}" for l in past_lessons[:5])
            context_parts.append(f"Lessons from similar past campaigns:\n{lessons_str}")

        channels = strategy.get("channel_mix", {}).get("channels", [])
        user_content = (
            f"Generate copy variants for ALL of the following channels: {', '.join(channels)}.\n"
            "Create 2-3 variants per channel, each addressing a different messaging pillar.\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON copy plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Compute channel_variant_count and copy_length_compliance from variants."""
        variants = output.get("variants", [])

        # Count variants per channel
        counts: dict[str, int] = {}
        for v in variants:
            ch = v.get("channel", "UNKNOWN")
            counts[ch] = counts.get(ch, 0) + 1
        output["channel_variant_count"] = counts

        # Check compliance per channel
        compliance: dict[str, bool] = {}
        for ch, spec in CHANNEL_COPY_SPECS.items():
            ch_variants = [v for v in variants if v.get("channel", "") == ch]
            if not ch_variants:
                continue
            compliant = True
            for v in ch_variants:
                headline = v.get("headline", "")
                body = v.get("body_copy", "")
                cta = v.get("cta_text", "")

                if "headline_chars" in spec and len(headline) > spec["headline_chars"]:
                    compliant = False
                if "body_words" in spec and len(body.split()) > spec["body_words"]:
                    compliant = False
                if "body_chars" in spec and len(body) > spec["body_chars"]:
                    compliant = False
                if "cta_words" in spec and len(cta.split()) > spec["cta_words"]:
                    compliant = False
                if "total_chars" in spec:
                    total = len(headline) + len(body) + len(cta)
                    if total > spec["total_chars"]:
                        compliant = False
            compliance[ch] = compliant

        output["copy_length_compliance"] = compliance
        return output
