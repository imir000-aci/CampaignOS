"""Golden-pair standalone tests for TargetingAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_targeting.py -v
All tests use stub mode — no Anthropic API key required.
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.targeting.agent import TargetingAgent
from agents.targeting.schemas import TargetingOutput, BidStrategy


def _strategy_output() -> dict:
    return {
        "objective": "Increase basket size by 15% among Southwest loyalty members.",
        "channel_mix": {
            "channels": ["EMAIL", "PAID_SOCIAL"],
            "primary_channel": "EMAIL",
            "channel_allocation": {"EMAIL": 0.55, "PAID_SOCIAL": 0.45},
        },
        "target_market": {
            "description": "Active Vons loyalty members in Southwest.",
            "segments": ["grilling_enthusiasts"],
            "geography": "Southwest + Pacific — top 500 stores",
            "age_bands": ["25-34", "35-44"],
        },
        "messaging_pillars": ["Premium grilling at loyalty prices"],
        "kpi_targets": [{"metric_name": "basket_size_uplift_pct", "target_value": 15.0,
                         "measurement_window_days": 90, "attribution_model": "LAST_TOUCH"}],
        "budget_total_cents": 50_000_000,
        "budget_media_cents": 37_500_000,
        "budget_production_cents": 7_500_000,
        "start_date": "2026-06-01",
        "end_date": "2026-08-31",
        "creative_brief_summary": "Summer grilling creative brief.",
        "risks": [],
        "rationale": "Southwest grilling index 142.",
    }


def _audience_output() -> dict:
    return {
        "primary_audience_description": "Active Southwest loyalty members with grilling affinity.",
        "segments": [
            {
                "segment_key": "heavy_grillers_loyal",
                "name": "Heavy Grillers",
                "description": "High LTV loyalty members with 3+ grilling purchases",
                "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                "estimated_size": 280000,
                "priority": 1,
            },
            {
                "segment_key": "occasional_grillers",
                "name": "Occasional Grillers",
                "description": "1-2 grilling purchases in last 90 days",
                "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                "estimated_size": 520000,
                "priority": 2,
            },
        ],
        "total_estimated_size": 850000,
        "suppression_rules": [
            {"reason": "opted_out_email", "rule": {"logic": "AND", "conditions": [], "sub_groups": []}},
            {"reason": "recently_churned", "rule": {"logic": "AND", "conditions": [], "sub_groups": []}},
        ],
        "lookalike_seed_segment_key": "heavy_grillers_loyal",
        "privacy_risk_level": "LOW",
        "privacy_notes": [],
        "channel_size_estimates": {"EMAIL": 720000, "PAID_SOCIAL": 680000},
        "rationale": "Three-segment structure for SW grilling campaign.",
    }


@pytest.fixture(scope="module")
def targeting_agent() -> TargetingAgent:
    return TargetingAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440003",
        upstream_outputs={
            "strategy": _strategy_output(),
            "audience": _audience_output(),
            "campaign_meta": {
                "name": "Summer Grilling Extravaganza",
                "start_date": "2026-06-01",
                "end_date": "2026-08-31",
            },
        },
        config=AgentConfig(stub_mode=True),
    )


# ---------------------------------------------------------------------------
# Golden-pair
# ---------------------------------------------------------------------------

class TestTargetingAgentGoldenPair:
    def test_run_returns_agent_output(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        assert result.agent_name == "targeting"
        assert result.campaign_id == grilling_input.campaign_id

    def test_output_is_schema_valid(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        parsed = TargetingOutput(**result.output)
        assert len(parsed.channel_configs) >= 1

    def test_each_config_has_required_fields(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        parsed = TargetingOutput(**result.output)
        for cfg in parsed.channel_configs:
            assert cfg.channel
            assert len(cfg.audience_segment_keys) >= 1
            assert cfg.bid_strategy in BidStrategy.__members__.values()
            assert cfg.bid_amount_cents >= 0
            assert cfg.daily_budget_cents >= 0
            assert cfg.estimated_reach >= 0

    def test_flight_days_positive(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        parsed = TargetingOutput(**result.output)
        assert parsed.flight_days > 0

    def test_total_estimated_reach_positive(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        parsed = TargetingOutput(**result.output)
        assert parsed.total_estimated_reach >= 0

    def test_rationale_present(self, targeting_agent, grilling_input):
        result = targeting_agent.run(grilling_input)
        parsed = TargetingOutput(**result.output)
        assert len(parsed.rationale) > 30

    def test_run_id_unique(self, targeting_agent, grilling_input):
        r1 = targeting_agent.run(grilling_input)
        r2 = targeting_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------

class TestTargetingAgentPreChecks:
    def test_missing_strategy_raises(self, targeting_agent):
        agent_input = AgentInput(
            campaign_id="no-strategy",
            upstream_outputs={"audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            targeting_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_missing_audience_raises(self, targeting_agent):
        agent_input = AgentInput(
            campaign_id="no-audience",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            targeting_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "audience_required"

    def test_strategy_with_no_channels_raises(self, targeting_agent):
        strategy = {**_strategy_output(), "channel_mix": {"channels": [], "primary_channel": ""}}
        agent_input = AgentInput(
            campaign_id="no-channels",
            upstream_outputs={"strategy": strategy, "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            targeting_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "channels_required"

    def test_valid_inputs_pass(self, targeting_agent):
        agent_input = AgentInput(
            campaign_id="valid",
            upstream_outputs={"strategy": _strategy_output(), "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        targeting_agent.pre_checks(agent_input)  # must not raise

    def test_zero_media_budget_logs_warning(self, targeting_agent, caplog):
        import logging
        strategy = {**_strategy_output(), "budget_media_cents": 0}
        agent_input = AgentInput(
            campaign_id="zero-budget",
            upstream_outputs={"strategy": strategy, "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        with caplog.at_level(logging.WARNING, logger="agents.targeting.agent"):
            targeting_agent.pre_checks(agent_input)  # must not raise
        assert any("budget_media_cents" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Post-process
# ---------------------------------------------------------------------------

class TestTargetingAgentPostProcess:
    def _post(self, targeting_agent, output: dict, upstream: dict | None = None) -> dict:
        dummy = AgentInput(
            campaign_id="x",
            upstream_outputs=upstream or {},
            config=AgentConfig(stub_mode=True),
        )
        return targeting_agent.post_process(output, dummy)

    def test_audience_suppression_keys_propagated(self, targeting_agent):
        output = {"suppression_audience_keys": [], "reach_deviation_pct": 0.0}
        audience = {
            "suppression_rules": [
                {"reason": "opted_out_email"},
                {"reason": "recently_churned"},
            ]
        }
        result = self._post(targeting_agent, output, upstream={"audience": audience})
        assert "opted_out_email" in result["suppression_audience_keys"]
        assert "recently_churned" in result["suppression_audience_keys"]

    def test_existing_suppression_not_duplicated(self, targeting_agent):
        output = {"suppression_audience_keys": ["opted_out_email"], "reach_deviation_pct": 0.0}
        audience = {"suppression_rules": [{"reason": "opted_out_email"}]}
        result = self._post(targeting_agent, output, upstream={"audience": audience})
        count = result["suppression_audience_keys"].count("opted_out_email")
        assert count == 1

    def test_high_reach_deviation_adds_risk_note(self, targeting_agent):
        output = {
            "suppression_audience_keys": [],
            "reach_deviation_pct": 55.0,
            "risk_notes": [],
        }
        result = self._post(targeting_agent, output)
        assert any("55.0%" in note or "40%" in note for note in result["risk_notes"])


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

class TestTargetingAgentBuildPrompt:
    def test_schema_placeholder_filled(self, targeting_agent, grilling_input):
        system, _ = targeting_agent.build_prompt(grilling_input)
        assert "{schema}" not in system

    def test_prompt_contains_channel_info(self, targeting_agent, grilling_input):
        _, messages = targeting_agent.build_prompt(grilling_input)
        assert "EMAIL" in messages[0].content or "PAID_SOCIAL" in messages[0].content

    def test_prompt_contains_audience_size(self, targeting_agent, grilling_input):
        _, messages = targeting_agent.build_prompt(grilling_input)
        assert "850,000" in messages[0].content or "850000" in messages[0].content

    def test_prompt_contains_suppressions(self, targeting_agent, grilling_input):
        _, messages = targeting_agent.build_prompt(grilling_input)
        assert "opted_out_email" in messages[0].content or "recently_churned" in messages[0].content


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------

class TestTargetingAgentDefaultConfig:
    def test_uses_haiku_model(self, targeting_agent):
        assert targeting_agent.default_config.model == "claude-haiku-4-5-20251001"

    def test_score_threshold(self, targeting_agent):
        assert targeting_agent.default_config.score_threshold == 3.5

    def test_dimensions(self, targeting_agent):
        expected = {"audience_coverage", "budget_efficiency", "channel_feasibility", "reach_viability"}
        assert set(targeting_agent.dimensions) == expected

    def test_token_budget(self, targeting_agent):
        assert targeting_agent.default_config.per_run_token_budget == 10_000
