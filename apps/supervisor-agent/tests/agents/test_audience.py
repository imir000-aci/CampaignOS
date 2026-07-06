"""Golden-pair standalone tests for AudienceAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_audience.py -v
All tests use stub mode — no Anthropic API key required.
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.audience.agent import AudienceAgent
from agents.audience.schemas import AudienceOutput, PrivacyRiskLevel


def _strategy_output() -> dict:
    return {
        "objective": "Increase basket size by 15% among Southwest loyalty members.",
        "channel_mix": {
            "channels": ["EMAIL", "PAID_SOCIAL"],
            "primary_channel": "EMAIL",
            "channel_allocation": {"EMAIL": 0.55, "PAID_SOCIAL": 0.45},
        },
        "target_market": {
            "description": "Active Vons loyalty members in Southwest and Pacific, 25-54, outdoor lifestyle.",
            "segments": ["grilling_enthusiasts", "loyalty_active_southwest"],
            "geography": "Southwest + Pacific — top 500 stores",
            "age_bands": ["25-34", "35-44", "45-54"],
        },
        "messaging_pillars": ["Premium grilling at loyalty prices", "30-minute outdoor meals"],
        "kpi_targets": [{"metric_name": "basket_size_uplift_pct", "target_value": 15.0,
                         "measurement_window_days": 90, "attribution_model": "LAST_TOUCH"}],
        "budget_total_cents": 50_000_000,
        "budget_media_cents": 37_500_000,
        "budget_production_cents": 7_500_000,
        "start_date": "2026-06-01",
        "end_date": "2026-08-31",
        "creative_brief_summary": "Summer grilling creative brief.",
        "risks": [],
        "rationale": "Southwest grilling index is 142.",
    }


@pytest.fixture(scope="module")
def audience_agent() -> AudienceAgent:
    return AudienceAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440002",
        upstream_outputs={
            "strategy": _strategy_output(),
            "campaign_meta": {
                "name": "Summer Grilling Extravaganza",
                "division_id": "div-southwest",
                "banner_id": "banner-vons",
                "start_date": "2026-06-01",
                "end_date": "2026-08-31",
            },
        },
        config=AgentConfig(stub_mode=True),
    )


# ---------------------------------------------------------------------------
# Golden-pair: well-formed input produces valid, schema-conformant output
# ---------------------------------------------------------------------------

class TestAudienceAgentGoldenPair:
    def test_run_returns_agent_output(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        assert result.agent_name == "audience"
        assert result.campaign_id == grilling_input.campaign_id

    def test_output_is_schema_valid(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert parsed.primary_audience_description
        assert len(parsed.primary_audience_description) > 20

    def test_has_segments(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert 1 <= len(parsed.segments) <= 5

    def test_segments_have_required_fields(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        for seg in parsed.segments:
            assert seg.segment_key
            assert seg.name
            assert seg.estimated_size >= 0
            assert 1 <= seg.priority <= 10

    def test_total_size_at_least_1000(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert parsed.total_estimated_size >= 1000

    def test_privacy_risk_level_is_valid(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert parsed.privacy_risk_level in (
            PrivacyRiskLevel.LOW, PrivacyRiskLevel.MEDIUM, PrivacyRiskLevel.HIGH
        )

    def test_channel_estimates_present(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert len(parsed.channel_size_estimates) >= 1

    def test_rationale_present(self, audience_agent, grilling_input):
        result = audience_agent.run(grilling_input)
        parsed = AudienceOutput(**result.output)
        assert len(parsed.rationale) > 30

    def test_run_id_unique(self, audience_agent, grilling_input):
        r1 = audience_agent.run(grilling_input)
        r2 = audience_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


# ---------------------------------------------------------------------------
# Post-process: standard suppressions injected
# ---------------------------------------------------------------------------

class TestAudienceAgentPostProcess:
    def _post(self, audience_agent, output: dict) -> dict:
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        return audience_agent.post_process(output, dummy)

    def test_opted_out_email_added_if_missing(self, audience_agent):
        output = {"suppression_rules": []}
        result = self._post(audience_agent, output)
        reasons = [s["reason"] for s in result["suppression_rules"]]
        assert "opted_out_email" in reasons

    def test_opted_out_sms_added_if_missing(self, audience_agent):
        output = {"suppression_rules": []}
        result = self._post(audience_agent, output)
        reasons = [s["reason"] for s in result["suppression_rules"]]
        assert "opted_out_sms" in reasons

    def test_do_not_contact_added_if_missing(self, audience_agent):
        output = {"suppression_rules": []}
        result = self._post(audience_agent, output)
        reasons = [s["reason"] for s in result["suppression_rules"]]
        assert "do_not_contact" in reasons

    def test_existing_suppression_not_duplicated(self, audience_agent):
        output = {
            "suppression_rules": [
                {"reason": "opted_out_email", "rule": {"logic": "AND", "conditions": [], "sub_groups": []}}
            ]
        }
        result = self._post(audience_agent, output)
        email_suppressions = [s for s in result["suppression_rules"] if s["reason"] == "opted_out_email"]
        assert len(email_suppressions) == 1


# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------

class TestAudienceAgentPreChecks:
    def test_missing_strategy_raises(self, audience_agent):
        agent_input = AgentInput(
            campaign_id="test-no-strategy",
            upstream_outputs={},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            audience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_strategy_with_no_channels_raises(self, audience_agent):
        agent_input = AgentInput(
            campaign_id="test-no-channels",
            upstream_outputs={
                "strategy": {
                    "channel_mix": {"channels": [], "primary_channel": ""},
                    "budget_media_cents": 1000000,
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            audience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "channels_required"

    def test_valid_strategy_passes(self, audience_agent):
        agent_input = AgentInput(
            campaign_id="test-valid",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        audience_agent.pre_checks(agent_input)  # must not raise

    def test_zero_budget_logs_warning_not_raise(self, audience_agent, caplog):
        import logging
        agent_input = AgentInput(
            campaign_id="test-zero-budget",
            upstream_outputs={
                "strategy": {
                    **_strategy_output(),
                    "budget_media_cents": 0,
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        with caplog.at_level(logging.WARNING, logger="agents.audience.agent"):
            audience_agent.pre_checks(agent_input)  # must not raise
        assert any("budget_media_cents" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

class TestAudienceAgentBuildPrompt:
    def test_prompt_schema_filled(self, audience_agent, grilling_input):
        system, messages = audience_agent.build_prompt(grilling_input)
        assert "{schema}" not in system
        assert "AudienceOutput" in system or "segments" in system

    def test_prompt_contains_strategy_objective(self, audience_agent, grilling_input):
        _, messages = audience_agent.build_prompt(grilling_input)
        assert "basket size" in messages[0].content.lower() or "15%" in messages[0].content

    def test_prompt_contains_channels(self, audience_agent, grilling_input):
        _, messages = audience_agent.build_prompt(grilling_input)
        assert "EMAIL" in messages[0].content or "PAID_SOCIAL" in messages[0].content

    def test_prompt_with_lessons(self, audience_agent):
        agent_input = AgentInput(
            campaign_id="test-lessons",
            upstream_outputs={
                "strategy": _strategy_output(),
                "past_lessons": ["Segment A converts 2x better", "Suppress recent purchasers"],
            },
            config=AgentConfig(stub_mode=True),
        )
        _, messages = audience_agent.build_prompt(agent_input)
        assert "Segment A" in messages[0].content


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------

class TestAudienceAgentDefaultConfig:
    def test_uses_sonnet_model(self, audience_agent):
        assert audience_agent.default_config.model == "claude-sonnet-5"

    def test_critique_model_is_haiku(self, audience_agent):
        assert audience_agent.default_config.critique_model == "claude-haiku-4-5-20251001"

    def test_dimensions(self, audience_agent):
        expected = {"strategy_alignment", "privacy_safety", "size_viability", "segment_distinctness"}
        assert set(audience_agent.dimensions) == expected

    def test_score_threshold(self, audience_agent):
        assert audience_agent.default_config.score_threshold == 3.5
