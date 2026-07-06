"""Shared pytest fixtures for agent tests.

Environment: AGENT_LLM_STUB=true is always set in conftest so that
agent tests never make real Anthropic API calls. Individual tests that
want to use the live LLM should pop this env var and provide their own
@pytest.mark.live marker (excluded from CI).
"""
import os
import uuid

import pytest

# Always stub the LLM in tests
os.environ["AGENT_LLM_STUB"] = "true"


FIXTURE_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def campaign_id() -> str:
    return FIXTURE_CAMPAIGN_ID


@pytest.fixture
def strategy_output() -> dict:
    """Golden strategy agent output used as upstream context in downstream agents."""
    return {
        "objective": "Drive incremental frozen food category sales during back-to-school season",
        "channel_mix": {
            "channels": ["EMAIL", "PAID_SOCIAL", "DISPLAY"],
            "primary_channel": "EMAIL",
        },
        "target_market": {
            "description": "Families with school-age children, loyalty members, 25-45",
            "segments": ["families_with_kids", "loyalty_members"],
        },
        "messaging_pillars": ["convenience", "value", "back_to_school_savings"],
        "kpi_targets": [
            {"metric_name": "incremental_revenue", "target_value": 500000},
            {"metric_name": "roas", "target_value": 3.5},
            {"metric_name": "offer_redemption_rate", "target_value": 0.15},
        ],
        "budget_total_cents": 10_000_000,
        "budget_media_cents": 7_000_000,
        "budget_production_cents": 3_000_000,
        "start_date": "2026-08-15",
        "end_date": "2026-09-15",
    }


@pytest.fixture
def audience_output() -> dict:
    """Golden audience agent output."""
    return {
        "audience_id": str(uuid.uuid4()),
        "audience_name": "BTS Families - Loyalty Members",
        "estimated_size": 250_000,
        "segments": [
            {"segment_key": "families_with_kids", "estimated_size": 180_000},
            {"segment_key": "loyalty_members", "estimated_size": 150_000},
        ],
        "rule_definition": {
            "operator": "AND",
            "conditions": [
                {"field": "has_children", "operator": "eq", "value": True},
                {"field": "loyalty_tier", "operator": "in", "value": ["GOLD", "PLATINUM"]},
            ],
        },
        "privacy_flags": [],
        "suppression_lists": [],
    }


@pytest.fixture
def upstream_outputs(strategy_output: dict, audience_output: dict) -> dict:
    return {
        "strategy": strategy_output,
        "audience": audience_output,
    }


@pytest.fixture
def minimal_agent_input(campaign_id: str) -> dict:
    return {
        "campaign_id": campaign_id,
        "upstream_outputs": {},
        "config": {
            "stub_mode": True,
            "per_run_token_budget": 5000,
        },
    }


@pytest.fixture
def full_agent_input(campaign_id: str, upstream_outputs: dict) -> dict:
    return {
        "campaign_id": campaign_id,
        "upstream_outputs": upstream_outputs,
        "config": {
            "stub_mode": True,
            "per_run_token_budget": 10_000,
        },
    }
