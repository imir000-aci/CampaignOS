"""PreviewAgent — assembles a human-readable campaign preview artifact for Gate 2.

Per architecture plan Section 3.1:
  Model: claude-haiku-4-5-20251001
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.5/5
  Hard minimum: 2.5/5
  Max iterations: 1  (Preview is the human gate — approve/reject replaces auto-retry)
  Dimensions: rendering_completeness, summary_accuracy, checklist_coverage

Pre-checks:
  - validation output must be present
  - validation must not be FAIL status (blocking violations block preview)
"""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import CampaignPreview

logger = logging.getLogger(__name__)

PREVIEW_SYSTEM_PROMPT = """\
You are the Preview Agent for CampaignOS, an AI-native marketing operating system.
Your role is to assemble a clear, concise campaign preview document for human approvers.
The approver may be a VP or CMO with limited time — make it easy to understand at a glance.

Guidelines:
- campaign_title: short (≤ 60 chars), brand-appropriate, captures the campaign essence.
- executive_summary: 2-3 sentences max. Objective, channels, key KPI target, flight dates.
- sections: include at minimum — Strategy, Audience, Creative, Targeting, Experience.
  Add Experiment and Measurement if present. Status = READY / INCOMPLETE / WARNING.
- channel_previews: one per channel in targeting.channel_configs.
  Use the first creative variant for each channel.
- checklist: actionable items the approver must verify (budget approval, legal review,
  asset upload, tracking pixel confirmation, etc.).
- estimated_total_reach: from targeting.total_estimated_reach.
- estimated_total_budget_usd: strategy.budget_total_cents / 100.
- flight_dates: "{{start_date}} → {{end_date}}" from strategy.
- approval_urgency: HIGH if campaign starts within 14 days; MEDIUM within 30 days; else LOW.
- validation_status: copy from validation.overall_status; launch_ready from validation.launch_readiness.
- flight_dates format: "{{start_date}} → {{end_date}}" (use actual dates from strategy).

You MUST respond with ONLY a valid JSON object matching the CampaignPreview schema.
Do not include prose, markdown, or explanations outside the JSON.

CampaignPreview schema:
{schema}
"""


class PreviewAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "preview"

    @property
    def output_schema(self) -> type[BaseModel]:
        return CampaignPreview

    @property
    def dimensions(self) -> list[str]:
        return [
            "rendering_completeness",
            "summary_accuracy",
            "checklist_coverage",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-haiku-4-5-20251001",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=1,
            score_threshold=3.5,
            hard_minimum_score=2.5,
            per_run_token_budget=8_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        validation = input.upstream_outputs.get("validation") or {}
        if not validation:
            raise PreCheckError(
                "Validation output is missing — PreviewAgent requires completed validation",
                check_name="validation_required",
            )

        overall_status = validation.get("overall_status", "")
        if overall_status == "FAIL":
            raise PreCheckError(
                "Validation status is FAIL — campaign has blocking violations and cannot proceed to preview",
                check_name="validation_must_not_fail",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(CampaignPreview.model_json_schema(), indent=2)
        system = PREVIEW_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        audience = input.upstream_outputs.get("audience", {})
        creative = input.upstream_outputs.get("creative", {})
        targeting = input.upstream_outputs.get("targeting", {})
        experience = input.upstream_outputs.get("experience", {})
        validation = input.upstream_outputs.get("validation", {})
        experiment = input.upstream_outputs.get("experiment", {})
        measurement = input.upstream_outputs.get("measurement", {})

        context_parts = []

        if strategy:
            channels = strategy.get("channel_mix", {}).get("channels", [])
            kpis = strategy.get("kpi_targets", [])
            primary_kpi = kpis[0].get("metric_name", "") if kpis else ""
            budget_usd = strategy.get("budget_total_cents", 0) / 100
            context_parts.append(
                f"Strategy:\n"
                f"  Objective: {strategy.get('objective', '')}\n"
                f"  Channels: {', '.join(channels)}\n"
                f"  Primary KPI: {primary_kpi}\n"
                f"  Budget: ${budget_usd:,.0f}\n"
                f"  Flight: {strategy.get('start_date', 'TBD')} → {strategy.get('end_date', 'TBD')}"
            )

        if audience:
            context_parts.append(
                f"Audience: {audience.get('primary_audience_description', '')}\n"
                f"  Total size: {audience.get('total_estimated_size', 0):,}"
            )

        if creative:
            variant_keys = [v.get("variant_key", "") for v in creative.get("variants", [])[:3]]
            context_parts.append(f"Creative variants: {', '.join(variant_keys)}")

        if targeting:
            context_parts.append(
                f"Targeting: {targeting.get('total_estimated_reach', 0):,} reach, "
                f"{targeting.get('flight_days', 0)} days"
            )

        if validation:
            context_parts.append(
                f"Validation: {validation.get('overall_status', 'UNKNOWN')}, "
                f"completeness={validation.get('completeness_score', 0):.0%}, "
                f"launch_ready={validation.get('launch_readiness', False)}"
            )

        if experiment:
            context_parts.append(
                f"Experiment: {experiment.get('experiment_type', '')} "
                f"({experiment.get('test_duration_days', 0)} days, "
                f"metric={experiment.get('primary_metric', '')})"
            )

        if measurement:
            kpi_names = [k.get("metric_name", "") for k in measurement.get("kpi_definitions", [])[:3]]
            context_parts.append(f"Measurement KPIs: {', '.join(kpi_names)}")

        user_content = (
            "Assemble a complete campaign preview for human approver review.\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON campaign preview."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Sync validation_status and launch_ready with actual validation output."""
        validation = input.upstream_outputs.get("validation", {})
        if validation:
            output["validation_status"] = validation.get("overall_status", output.get("validation_status", "UNKNOWN"))
            output["launch_ready"] = validation.get("launch_readiness", output.get("launch_ready", False))

        return output
