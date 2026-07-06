"""Golden-pair standalone tests for CreativeAgent (copy only — no image generation).

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_creative.py -v
All tests use stub mode — no Anthropic API key required.
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.creative.agent import CreativeAgent
from agents.creative.schemas import CreativeOutput, CopyVariant


def _strategy_output() -> dict:
    return {
        "objective": "Increase basket size by 15% among Southwest loyalty members.",
        "channel_mix": {
            "channels": ["EMAIL", "PAID_SOCIAL"],
            "primary_channel": "EMAIL",
            "channel_allocation": {"EMAIL": 0.55, "PAID_SOCIAL": 0.45},
        },
        "target_market": {
            "description": "Active Vons loyalty members in Southwest, 25-54.",
            "segments": ["grilling_enthusiasts"],
            "geography": "Southwest + Pacific — top 500 stores",
            "age_bands": ["25-34", "35-44"],
        },
        "messaging_pillars": [
            "Premium grilling ingredients at unbeatable loyalty prices",
            "Everything you need for the perfect backyard cookout",
            "Chef-quality meals in under 30 minutes",
        ],
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
                "description": "High LTV loyalty members",
                "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                "estimated_size": 280000,
                "priority": 1,
            }
        ],
        "total_estimated_size": 800000,
        "suppression_rules": [],
        "lookalike_seed_segment_key": "heavy_grillers_loyal",
        "privacy_risk_level": "LOW",
        "privacy_notes": [],
        "channel_size_estimates": {"EMAIL": 720000, "PAID_SOCIAL": 680000},
        "rationale": "Grilling affinity audience.",
    }


@pytest.fixture(scope="module")
def creative_agent() -> CreativeAgent:
    return CreativeAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440004",
        upstream_outputs={
            "strategy": _strategy_output(),
            "audience": _audience_output(),
            "campaign_meta": {
                "name": "Summer Grilling Extravaganza",
                "banner_id": "banner-vons",
            },
        },
        config=AgentConfig(stub_mode=True),
    )


# ---------------------------------------------------------------------------
# Golden-pair
# ---------------------------------------------------------------------------

class TestCreativeAgentGoldenPair:
    def test_run_returns_agent_output(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        assert result.agent_name == "creative"
        assert result.campaign_id == grilling_input.campaign_id

    def test_output_is_schema_valid(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        parsed = CreativeOutput(**result.output)
        assert len(parsed.variants) >= 1

    def test_each_variant_has_required_fields(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        parsed = CreativeOutput(**result.output)
        for v in parsed.variants:
            assert v.variant_key
            assert v.channel
            assert v.headline
            assert v.body_copy
            assert v.cta_text
            assert v.messaging_pillar_ref
            assert v.tone

    def test_word_count_computed(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        parsed = CreativeOutput(**result.output)
        for v in parsed.variants:
            assert v.word_count == len(v.body_copy.split())

    def test_channel_variant_count_computed_by_post_process(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        assert "channel_variant_count" in result.output
        total = sum(result.output["channel_variant_count"].values())
        assert total == len(result.output["variants"])

    def test_copy_length_compliance_computed(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        assert "copy_length_compliance" in result.output

    def test_brand_voice_notes_present(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        parsed = CreativeOutput(**result.output)
        assert len(parsed.brand_voice_notes) > 20

    def test_rationale_present(self, creative_agent, grilling_input):
        result = creative_agent.run(grilling_input)
        parsed = CreativeOutput(**result.output)
        assert len(parsed.rationale) > 30

    def test_run_id_unique(self, creative_agent, grilling_input):
        r1 = creative_agent.run(grilling_input)
        r2 = creative_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


# ---------------------------------------------------------------------------
# Post-process
# ---------------------------------------------------------------------------

class TestCreativeAgentPostProcess:
    def _post(self, creative_agent, output: dict) -> dict:
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        return creative_agent.post_process(output, dummy)

    def test_channel_variant_count_calculated(self, creative_agent):
        output = {
            "variants": [
                {"variant_key": "email_v1", "channel": "EMAIL", "headline": "H1",
                 "body_copy": "Body", "cta_text": "CTA", "messaging_pillar_ref": "p1", "tone": "warm"},
                {"variant_key": "email_v2", "channel": "EMAIL", "headline": "H2",
                 "body_copy": "Body 2", "cta_text": "CTA 2", "messaging_pillar_ref": "p2", "tone": "warm"},
                {"variant_key": "social_v1", "channel": "PAID_SOCIAL", "headline": "H3",
                 "body_copy": "Short body", "cta_text": "Buy", "messaging_pillar_ref": "p1", "tone": "urgent"},
            ]
        }
        result = self._post(creative_agent, output)
        assert result["channel_variant_count"]["EMAIL"] == 2
        assert result["channel_variant_count"]["PAID_SOCIAL"] == 1

    def test_email_compliance_long_headline_fails(self, creative_agent):
        long_headline = "A" * 51  # 51 chars > 50 limit
        output = {
            "variants": [
                {"variant_key": "email_v1", "channel": "EMAIL", "headline": long_headline,
                 "body_copy": "Short", "cta_text": "Click Here", "messaging_pillar_ref": "p1", "tone": "warm"},
            ]
        }
        result = self._post(creative_agent, output)
        assert result["copy_length_compliance"].get("EMAIL") is False

    def test_email_compliance_valid_copy_passes(self, creative_agent):
        output = {
            "variants": [
                {"variant_key": "email_v1", "channel": "EMAIL",
                 "headline": "Short Headline",
                 "body_copy": "Short body copy here.",
                 "cta_text": "Shop Now",
                 "messaging_pillar_ref": "p1", "tone": "warm"},
            ]
        }
        result = self._post(creative_agent, output)
        assert result["copy_length_compliance"].get("EMAIL") is True

    def test_paid_social_compliance_long_body_fails(self, creative_agent):
        long_body = " ".join(["word"] * 130)  # 130 words > 125 limit
        output = {
            "variants": [
                {"variant_key": "social_v1", "channel": "PAID_SOCIAL",
                 "headline": "Short",
                 "body_copy": long_body,
                 "cta_text": "Shop",
                 "messaging_pillar_ref": "p1", "tone": "urgent"},
            ]
        }
        result = self._post(creative_agent, output)
        assert result["copy_length_compliance"].get("PAID_SOCIAL") is False


# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------

class TestCreativeAgentPreChecks:
    def test_missing_strategy_raises(self, creative_agent):
        agent_input = AgentInput(
            campaign_id="no-strategy",
            upstream_outputs={"audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            creative_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_strategy_with_no_pillars_raises(self, creative_agent):
        strategy = {**_strategy_output(), "messaging_pillars": []}
        agent_input = AgentInput(
            campaign_id="no-pillars",
            upstream_outputs={"strategy": strategy, "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            creative_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "messaging_pillars_required"

    def test_missing_audience_raises(self, creative_agent):
        agent_input = AgentInput(
            campaign_id="no-audience",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            creative_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "audience_required"

    def test_strategy_no_channels_raises(self, creative_agent):
        strategy = {**_strategy_output(), "channel_mix": {"channels": [], "primary_channel": ""}}
        agent_input = AgentInput(
            campaign_id="no-channels",
            upstream_outputs={"strategy": strategy, "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        from agent_base.base import PreCheckError
        with pytest.raises(PreCheckError) as exc_info:
            creative_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "channels_required"

    def test_valid_inputs_pass(self, creative_agent):
        agent_input = AgentInput(
            campaign_id="valid",
            upstream_outputs={"strategy": _strategy_output(), "audience": _audience_output()},
            config=AgentConfig(stub_mode=True),
        )
        creative_agent.pre_checks(agent_input)  # must not raise


# ---------------------------------------------------------------------------
# Prompt building
# ---------------------------------------------------------------------------

class TestCreativeAgentBuildPrompt:
    def test_schema_placeholder_filled(self, creative_agent, grilling_input):
        system, _ = creative_agent.build_prompt(grilling_input)
        assert "{schema}" not in system

    def test_prompt_contains_messaging_pillars(self, creative_agent, grilling_input):
        _, messages = creative_agent.build_prompt(grilling_input)
        content = messages[0].content
        assert "Premium grilling" in content or "loyalty prices" in content

    def test_prompt_contains_channels(self, creative_agent, grilling_input):
        _, messages = creative_agent.build_prompt(grilling_input)
        assert "EMAIL" in messages[0].content

    def test_prompt_includes_lessons(self, creative_agent):
        agent_input = AgentInput(
            campaign_id="test-lessons",
            upstream_outputs={
                "strategy": _strategy_output(),
                "audience": _audience_output(),
                "past_lessons": ["Real food photos outperform lifestyle shots 31% CTR"],
            },
            config=AgentConfig(stub_mode=True),
        )
        _, messages = creative_agent.build_prompt(agent_input)
        assert "Real food photos" in messages[0].content


# ---------------------------------------------------------------------------
# Default config
# ---------------------------------------------------------------------------

class TestCreativeAgentDefaultConfig:
    def test_uses_sonnet_model(self, creative_agent):
        assert creative_agent.default_config.model == "claude-sonnet-5"

    def test_critique_model_is_sonnet(self, creative_agent):
        assert creative_agent.default_config.critique_model == "claude-sonnet-5"

    def test_score_threshold(self, creative_agent):
        assert creative_agent.default_config.score_threshold == 4.0

    def test_hard_minimum(self, creative_agent):
        assert creative_agent.default_config.hard_minimum_score == 3.0

    def test_dimensions(self, creative_agent):
        expected = {"brand_compliance", "copy_clarity", "cta_strength", "channel_appropriateness"}
        assert set(creative_agent.dimensions) == expected

    def test_token_budget(self, creative_agent):
        assert creative_agent.default_config.per_run_token_budget == 15_000
