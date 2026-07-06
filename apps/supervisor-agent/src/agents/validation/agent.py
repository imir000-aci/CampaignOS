"""ValidationAgent — validates campaign completeness, brand compliance, and regulatory safety.

Per architecture plan Section 3.1:
  Model: claude-haiku-4-5-20251001
  Critique model: claude-opus-4-8 (high stakes — catches false negatives)
  Score threshold: 4.5/5
  Hard minimum: 4.0/5
  Max iterations: 3
  Dimensions: completeness, compliance_coverage, false_negative_risk

Pre-checks:
  - strategy must be present
  - at least 4 of the 7 downstream agents must have output (strategy, audience,
    creative, targeting, experience, experiment, measurement)

Post-process:
  - derives blocking_violations list from CRITICAL severity violations
  - sets overall_status based on presence of blocking_violations
  - sets launch_readiness = (overall_status != FAIL)
  - recomputes completeness_score from completeness_checks list
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import ValidationOutput

logger = logging.getLogger(__name__)

# Agents that must be present for a complete campaign package
REQUIRED_AGENTS = ["strategy", "audience", "creative", "targeting", "experience"]
ALL_AGENTS = ["strategy", "audience", "creative", "targeting", "experience", "experiment", "measurement"]

VALIDATION_SYSTEM_PROMPT = """\
You are the Validation Agent for CampaignOS, an AI-native marketing operating system.
Your role is to perform a comprehensive compliance and completeness audit of the full
campaign package before it proceeds to human review and launch.

Validation checklist:
1. COMPLETENESS — every required agent (strategy, audience, creative, targeting, experience)
   has produced output; experiment and measurement are strongly recommended.
2. BRAND COMPLIANCE — all creative copy references approved messaging pillars;
   no forbidden phrases; tone matches brand guidelines.
3. REGULATORY — no PII in prompts; audience segments comply with data minimization;
   no targeting of minors; offer terms are legally sound.
4. PLATFORM POLICY — copy length within channel limits; frequency caps present;
   suppression lists populated.
5. BUDGET INTEGRITY — total channel spend ≤ strategy budget_media_cents;
   no channel with daily_budget_cents = 0.
6. CROSS-AGENT CONSISTENCY — audience segments referenced in experience exist in audience output;
   creative variant keys referenced in experience exist in creative output;
   experiment primary_metric exists in measurement kpi_definitions.

Severity guidance:
- CRITICAL: Blocks launch. Missing required agent output, regulatory violation,
  budget overrun > 10%, PII exposure.
- WARNING: Should fix before launch but not blocking. Missing recommended agents,
  minor copy-length overrun, no experiment defined.
- INFO: Nice-to-have improvements.

overall_status rules:
- "FAIL" if any CRITICAL violation
- "PASS_WITH_WARNINGS" if only WARNING/INFO violations
- "PASS" if no violations

launch_readiness: true only if overall_status != "FAIL"
completeness_score: (passed checks) / (total checks)
brand_compliance_score: 0.0-1.0 based on brand checks
regulatory_compliance_score: 0.0-1.0 based on regulatory checks

You MUST respond with ONLY a valid JSON object matching the ValidationOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

ValidationOutput schema:
{schema}
"""


class ValidationAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "validation"

    @property
    def output_schema(self) -> type[BaseModel]:
        return ValidationOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "completeness",
            "compliance_coverage",
            "false_negative_risk",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-haiku-4-5-20251001",
            critique_model="claude-opus-4-8",
            max_iterations=3,
            score_threshold=4.5,
            hard_minimum_score=4.0,
            per_run_token_budget=15_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}
        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — ValidationAgent requires at least strategy output",
                check_name="strategy_required",
            )

        present = [a for a in ALL_AGENTS if input.upstream_outputs.get(a)]
        if len(present) < len(REQUIRED_AGENTS):
            missing = [a for a in REQUIRED_AGENTS if not input.upstream_outputs.get(a)]
            raise PreCheckError(
                f"Required agent outputs missing: {missing}. "
                "ValidationAgent requires strategy, audience, creative, targeting, experience.",
                check_name="minimum_agents_required",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(ValidationOutput.model_json_schema(), indent=2)
        system = VALIDATION_SYSTEM_PROMPT.format(schema=schema_json)

        sections = []

        for agent_name in ALL_AGENTS:
            data = input.upstream_outputs.get(agent_name)
            if data:
                # Truncate large outputs to avoid token exhaustion
                data_str = json.dumps(data)
                if len(data_str) > 2000:
                    data_str = data_str[:2000] + "...[truncated]"
                sections.append(f"--- {agent_name.upper()} OUTPUT ---\n{data_str}")
            else:
                sections.append(f"--- {agent_name.upper()} OUTPUT ---\n[NOT PROVIDED]")

        user_content = (
            "Perform a complete validation audit of the following campaign package.\n"
            "Check all 6 categories: completeness, brand compliance, regulatory, "
            "platform policy, budget integrity, cross-agent consistency.\n\n"
            + "\n\n".join(sections)
            + "\n\nRespond with ONLY the JSON validation report."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Derive blocking_violations, overall_status, and launch_readiness from violations."""
        violations = output.get("violations", [])

        # Rebuild blocking_violations from CRITICAL items
        blocking = [
            v.get("violation_id", "") if isinstance(v, dict) else v.violation_id
            for v in violations
            if (v.get("severity") if isinstance(v, dict) else v.severity) == "CRITICAL"
        ]
        output["blocking_violations"] = blocking

        # Derive overall_status
        if blocking:
            output["overall_status"] = "FAIL"
        elif any(
            (v.get("severity") if isinstance(v, dict) else v.severity) == "WARNING"
            for v in violations
        ):
            output["overall_status"] = "PASS_WITH_WARNINGS"
        else:
            output["overall_status"] = "PASS"

        # launch_readiness
        output["launch_readiness"] = output["overall_status"] != "FAIL"

        # Recompute completeness_score
        checks = output.get("completeness_checks", [])
        if checks:
            passed = sum(
                1 for c in checks
                if (c.get("passed") if isinstance(c, dict) else c.passed)
            )
            output["completeness_score"] = passed / len(checks)

        return output
