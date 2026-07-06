"""Golden-pair standalone tests for StrategyAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_strategy.py -v
All tests use stub mode — no Anthropic API key required.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

# Ensure stub mode is always active for these tests
os.environ.setdefault("AGENT_LLM_STUB", "true")

from agent_base.schemas import AgentConfig, AgentInput
from agents.strategy.agent import StrategyAgent
from agents.strategy.schemas import StrategyOutput

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture(scope="module")
def strategy_agent() -> StrategyAgent:
    return StrategyAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    raw = _load_fixture("strategy_input_001.json")
    return AgentInput(**raw)


# ---------------------------------------------------------------------------
# Golden-pair: well-formed input produces valid, schema-conformant output
# ---------------------------------------------------------------------------

class TestStrategyAgentGoldenPair:
    def test_run_returns_agent_output(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        assert result is not None
        assert result.agent_name == "strategy"
        assert result.campaign_id == grilling_input.campaign_id

    def test_output_is_schema_valid(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        # Must parse without error
        parsed = StrategyOutput(**result.output)
        assert parsed.objective
        assert len(parsed.objective) > 20

    def test_output_has_channel_mix(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        assert len(parsed.channel_mix.channels) >= 1
        assert parsed.channel_mix.primary_channel in parsed.channel_mix.channels

    def test_channels_are_uppercase(self, strategy_agent, grilling_input):
        """post_process must normalize channel names to uppercase."""
        result = strategy_agent.run(grilling_input)
        for ch in result.output["channel_mix"]["channels"]:
            assert ch == ch.upper(), f"Channel not uppercase: {ch}"

    def test_output_has_kpi_targets(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        assert len(parsed.kpi_targets) >= 1
        for kpi in parsed.kpi_targets:
            assert kpi.metric_name
            assert kpi.target_value > 0

    def test_output_has_messaging_pillars(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        assert 1 <= len(parsed.messaging_pillars) <= 5
        for pillar in parsed.messaging_pillars:
            assert len(pillar) > 5

    def test_budget_consistency(self, strategy_agent, grilling_input):
        """budget_media + budget_production must not exceed budget_total after post_process."""
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        assert parsed.budget_media_cents + parsed.budget_production_cents <= parsed.budget_total_cents

    def test_dates_are_iso_strings(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        import re
        iso_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        assert iso_pattern.match(parsed.start_date), f"start_date not ISO: {parsed.start_date}"
        assert iso_pattern.match(parsed.end_date), f"end_date not ISO: {parsed.end_date}"

    def test_rationale_and_creative_brief_present(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        parsed = StrategyOutput(**result.output)
        assert len(parsed.rationale) > 50
        assert len(parsed.creative_brief_summary) > 50

    def test_run_id_is_unique(self, strategy_agent, grilling_input):
        r1 = strategy_agent.run(grilling_input)
        r2 = strategy_agent.run(grilling_input)
        assert r1.run_id != r2.run_id

    def test_iterations_within_bounds(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        assert 1 <= result.iterations <= strategy_agent.default_config.max_iterations + 1

    def test_tokens_tracked(self, strategy_agent, grilling_input):
        result = strategy_agent.run(grilling_input)
        assert result.tokens_used >= 0
        assert result.estimated_cost_usd >= 0.0


# ---------------------------------------------------------------------------
# Pre-check failures
# ---------------------------------------------------------------------------

class TestStrategyAgentPreChecks:
    def test_empty_brief_raises(self, strategy_agent):
        agent_input = AgentInput(
            campaign_id="test-empty-brief",
            upstream_outputs={
                "campaign_meta": {
                    "name": "No Brief Campaign",
                    "brief_text": "   ",
                    "budget_total_cents": 100000,
                    "start_date": "2026-06-01",
                    "end_date": "2026-08-31",
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            strategy_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "brief_not_empty"

    def test_inverted_dates_raises(self, strategy_agent):
        agent_input = AgentInput(
            campaign_id="test-bad-dates",
            upstream_outputs={
                "campaign_meta": {
                    "name": "Bad Dates Campaign",
                    "brief_text": "Valid brief text for testing date validation logic.",
                    "budget_total_cents": 100000,
                    "start_date": "2026-09-01",
                    "end_date": "2026-06-01",
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            strategy_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "date_order"

    def test_equal_dates_raises(self, strategy_agent):
        agent_input = AgentInput(
            campaign_id="test-equal-dates",
            upstream_outputs={
                "campaign_meta": {
                    "name": "Same Day Campaign",
                    "brief_text": "Valid brief text for testing same-day date validation.",
                    "budget_total_cents": 100000,
                    "start_date": "2026-06-01",
                    "end_date": "2026-06-01",
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            strategy_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "date_order"

    def test_zero_budget_logs_warning_but_does_not_raise(self, strategy_agent, caplog):
        """Zero budget logs a warning but is not a hard failure — strategy can proceed."""
        import logging
        agent_input = AgentInput(
            campaign_id="test-zero-budget",
            upstream_outputs={
                "campaign_meta": {
                    "name": "Zero Budget",
                    "brief_text": "Valid brief text to ensure pre-checks pass date and brief validation.",
                    "budget_total_cents": 0,
                    "start_date": "2026-06-01",
                    "end_date": "2026-08-31",
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        with caplog.at_level(logging.WARNING, logger="agents.strategy.agent"):
            strategy_agent.pre_checks(agent_input)  # must not raise
        assert any("budget_total_cents" in r.message for r in caplog.records)

    def test_valid_brief_from_top_level_brief_key(self, strategy_agent):
        """Brief text can come from upstream_outputs['brief']['brief_text']."""
        agent_input = AgentInput(
            campaign_id="test-brief-key",
            upstream_outputs={
                "brief": {"brief_text": "Valid brief text under the brief key for validation."},
                "campaign_meta": {
                    "budget_total_cents": 100000,
                    "start_date": "2026-06-01",
                    "end_date": "2026-08-31",
                },
            },
            config=AgentConfig(stub_mode=True),
        )
        strategy_agent.pre_checks(agent_input)  # must not raise


# ---------------------------------------------------------------------------
# Post-process: budget capping
# ---------------------------------------------------------------------------

class TestStrategyAgentPostProcess:
    def _run_post_process(self, strategy_agent, output: dict) -> dict:
        dummy_input = AgentInput(
            campaign_id="test-post-process",
            upstream_outputs={},
            config=AgentConfig(stub_mode=True),
        )
        return strategy_agent.post_process(output, dummy_input)

    def test_budget_overage_scales_down(self, strategy_agent):
        output = {
            "channel_mix": {"channels": ["email", "sms"], "primary_channel": "email"},
            "budget_total_cents": 1_000_000,
            "budget_media_cents": 800_000,
            "budget_production_cents": 400_000,  # 800+400 = 1.2M > 1M total
        }
        result = self._run_post_process(strategy_agent, output)
        assert result["budget_media_cents"] + result["budget_production_cents"] <= result["budget_total_cents"]

    def test_budget_within_bounds_unchanged(self, strategy_agent):
        output = {
            "channel_mix": {"channels": ["EMAIL"], "primary_channel": "EMAIL"},
            "budget_total_cents": 1_000_000,
            "budget_media_cents": 600_000,
            "budget_production_cents": 200_000,
        }
        result = self._run_post_process(strategy_agent, output)
        assert result["budget_media_cents"] == 600_000
        assert result["budget_production_cents"] == 200_000

    def test_channels_uppercased(self, strategy_agent):
        output = {
            "channel_mix": {"channels": ["email", "paid_social", "sms"], "primary_channel": "email"},
            "budget_total_cents": 0,
            "budget_media_cents": 0,
            "budget_production_cents": 0,
        }
        result = self._run_post_process(strategy_agent, output)
        assert result["channel_mix"]["channels"] == ["EMAIL", "PAID_SOCIAL", "SMS"]


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

class TestStrategyAgentBuildPrompt:
    def test_prompt_contains_schema_placeholder_filled(self, strategy_agent, grilling_input):
        system, messages = strategy_agent.build_prompt(grilling_input)
        assert "StrategyOutput" in system or "objective" in system
        assert "{schema}" not in system  # must be filled in

    def test_prompt_contains_campaign_name(self, strategy_agent, grilling_input):
        _, messages = strategy_agent.build_prompt(grilling_input)
        user_content = messages[0].content
        assert "Summer Grilling" in user_content

    def test_prompt_contains_lessons_when_provided(self, strategy_agent, grilling_input):
        _, messages = strategy_agent.build_prompt(grilling_input)
        user_content = messages[0].content
        assert "Thursday" in user_content or "past campaigns" in user_content.lower()

    def test_prompt_with_no_lessons_still_builds(self, strategy_agent):
        agent_input = AgentInput(
            campaign_id="no-lessons",
            upstream_outputs={
                "campaign_meta": {
                    "name": "No Lessons Campaign",
                    "brief_text": "Drive new customer acquisition through digital channels.",
                    "budget_total_cents": 20000000,
                    "start_date": "2026-03-01",
                    "end_date": "2026-05-31",
                }
            },
            config=AgentConfig(stub_mode=True),
        )
        system, messages = strategy_agent.build_prompt(agent_input)
        assert len(messages) == 1
        assert messages[0].role == "user"
        assert "No Lessons Campaign" in messages[0].content


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------

class TestStrategyAgentDefaultConfig:
    def test_uses_opus_model(self, strategy_agent):
        assert strategy_agent.default_config.model == "claude-opus-4-8"

    def test_critique_model_is_haiku(self, strategy_agent):
        assert strategy_agent.default_config.critique_model == "claude-haiku-4-5-20251001"

    def test_score_threshold(self, strategy_agent):
        assert strategy_agent.default_config.score_threshold == 3.8

    def test_hard_minimum(self, strategy_agent):
        assert strategy_agent.default_config.hard_minimum_score == 2.5

    def test_max_iterations(self, strategy_agent):
        assert strategy_agent.default_config.max_iterations == 2

    def test_token_budget(self, strategy_agent):
        assert strategy_agent.default_config.per_run_token_budget == 20_000

    def test_dimensions(self, strategy_agent):
        expected = {"brief_alignment", "specificity", "feasibility", "kpi_clarity", "channel_rationale"}
        assert set(strategy_agent.dimensions) == expected
