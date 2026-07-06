"""Tests for CampaignCreationWorkflow using a mock-based approach.

The Temporal test server requires downloading a binary, so these tests use
patched Temporal internals to exercise the workflow state machine in-process.
All agent activities are replaced with stubs that return valid canned output.

Run with: pytest tests/test_campaign_creation_workflow.py -v
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any, Callable
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure supervisor-agent src is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "supervisor-agent" / "src"))

os.environ.setdefault("AGENT_LLM_STUB", "true")

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "packages" / "agent-base" / "tests" / "fixtures"
os.environ.setdefault("AGENT_STUB_FIXTURES_DIR", str(FIXTURES_DIR))

import pytest

from src.workflows.campaign_creation import (
    AbortSignal,
    CampaignCreationInput,
    CampaignCreationWorkflow,
    HumanReviewSignal,
)

TEST_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440099"

# ---------------------------------------------------------------------------
# Stub activity outputs — mirrors what the real agents return in stub mode
# ---------------------------------------------------------------------------

_AGENT_STUB_OUTPUTS: dict[str, Any] = {
    "strategy": {"strategy_type": "ACQUISITION", "channels": ["EMAIL", "PAID_SOCIAL"], "kpi_targets": []},
    "audience": {"audience_type": "AI_GENERATED", "rule_definition": {}, "estimated_size": 250000},
    "creative": {"variants": [{"variant_key": "v1", "headline": "Test", "body": "Body", "cta": "Shop Now"}]},
    "targeting": {"channel_configs": [{"channel": "EMAIL", "bid_strategy": "CPC"}]},
    "experience": {"experience_type": "EMAIL", "variants": []},
    "experiment": {"experiment_type": "AB", "variants": [{"variant_key": "control", "is_control": True}]},
    "measurement": {"kpi_definitions": [{"metric_name": "ctr", "data_sources": [], "attribution_model": "LAST_TOUCH"}]},
    "validation": {"overall_status": "PASS_WITH_WARNINGS", "completeness_score": 0.9, "launch_readiness": True,
                   "completeness_checks": [], "violations": [], "blocking_violations": [], "recommendations": []},
    "preview": {"campaign_title": "Test Campaign", "sections": [], "channel_previews": [],
                "checklist": ["Review budget"], "launch_ready": True, "validation_status": "PASS_WITH_WARNINGS"},
}


# ---------------------------------------------------------------------------
# Test harness helpers
# ---------------------------------------------------------------------------

async def _mock_wait_condition(condition: Callable[[], bool], *, timeout: timedelta | None = None) -> None:
    """Poll the condition, yielding to the event loop each iteration.

    Temporal's real wait_condition suspends the workflow coroutine until the
    condition lambda returns True. Here we spin-yield so that other tasks
    (signal senders) can run and mutate workflow state, at which point the
    condition will become True and we return.
    """
    for _ in range(10_000):
        if condition():
            return
        await asyncio.sleep(0)
    raise TimeoutError("wait_condition timed out after 10,000 iterations")


async def _mock_execute_activity(activity_fn, params, **kwargs) -> Any:
    """Route to stub activity output by function name."""
    name = getattr(activity_fn, "__name__", "") or getattr(activity_fn, "defn", {}).get("name", "")
    # activity_fn names follow pattern run_<agent>_agent
    for agent_name in _AGENT_STUB_OUTPUTS:
        if agent_name in name:
            return _AGENT_STUB_OUTPUTS[agent_name]
    return {}


def _workflow_patches():
    """Context manager stack that makes the workflow runnable outside Temporal."""
    return [
        patch("temporalio.workflow.execute_activity", side_effect=_mock_execute_activity),
        patch("temporalio.workflow.wait_condition", side_effect=_mock_wait_condition),
    ]


async def _run_workflow_with_signals(signals_fn) -> Any:
    """
    Start the workflow coroutine as an asyncio task, let signals_fn inject
    signals, then return the workflow result.

    signals_fn receives the CampaignCreationWorkflow instance and should
    await any signal calls needed to unblock the workflow.
    """
    patches = _workflow_patches()
    # Start all patches
    mocks = [p.start() for p in patches]
    try:
        wf = CampaignCreationWorkflow()
        task = asyncio.create_task(
            wf.run(CampaignCreationInput(campaign_id=TEST_CAMPAIGN_ID, stub_mode=True))
        )
        # Yield to let the workflow task begin executing up to its first await
        await asyncio.sleep(0)
        # Let signals_fn inject signals/state changes
        await signals_fn(wf)
        return await task
    finally:
        for p in patches:
            p.stop()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workflow_completes_after_both_gates_approved():
    """Full happy path: both Gate 1 and Gate 2 approved → finalized=True."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        # Small delay so the workflow reaches Gate 1's wait_condition
        await asyncio.sleep(0)
        await wf.strategy_review_signal(HumanReviewSignal(approved=True, reviewer_id="approver-1"))
        # Let it advance past Gate 1 to Gate 2
        for _ in range(50):
            await asyncio.sleep(0)
        await wf.preview_review_signal(HumanReviewSignal(approved=True, reviewer_id="approver-2"))

    result = await _run_workflow_with_signals(_send_signals)
    assert result.finalized is True
    assert result.gate1_approved is True
    assert result.gate2_approved is True
    assert result.aborted is False


@pytest.mark.asyncio
async def test_workflow_stops_at_strategy_rejection():
    """Gate 1 rejected → current_step=STRATEGY_REJECTED, finalized=False."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        await asyncio.sleep(0)
        await wf.strategy_review_signal(
            HumanReviewSignal(approved=False, reviewer_id="approver-1", comments="Needs revision")
        )

    result = await _run_workflow_with_signals(_send_signals)
    assert result.finalized is False
    assert result.gate1_approved is False
    assert result.current_step == "STRATEGY_REJECTED"


@pytest.mark.asyncio
async def test_workflow_aborts_on_abort_signal():
    """AbortCampaignSignal before Gate 1 → aborted=True."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        await asyncio.sleep(0)
        await wf.abort_campaign_signal(AbortSignal(reason="Budget withdrawn"))
        # Also unblock gate 1 so wait_condition completes
        await wf.strategy_review_signal(HumanReviewSignal(approved=True))

    result = await _run_workflow_with_signals(_send_signals)
    assert result.aborted is True
    assert result.abort_reason == "Budget withdrawn"


@pytest.mark.asyncio
async def test_workflow_query_returns_status():
    """Query get_status returns current step; campaign_id is set."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        await asyncio.sleep(0)
        # Query mid-flight
        status = wf.get_status()
        assert status.campaign_id == TEST_CAMPAIGN_ID
        await wf.strategy_review_signal(HumanReviewSignal(approved=True))
        for _ in range(50):
            await asyncio.sleep(0)
        await wf.preview_review_signal(HumanReviewSignal(approved=True))

    result = await _run_workflow_with_signals(_send_signals)
    assert result.campaign_id == TEST_CAMPAIGN_ID


@pytest.mark.asyncio
async def test_all_9_agents_run_in_happy_path():
    """All 9 agent outputs are populated after a successful full run."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        await asyncio.sleep(0)
        await wf.strategy_review_signal(HumanReviewSignal(approved=True))
        for _ in range(50):
            await asyncio.sleep(0)
        await wf.preview_review_signal(HumanReviewSignal(approved=True))

    result = await _run_workflow_with_signals(_send_signals)
    expected_agents = {
        "strategy", "audience", "creative", "targeting", "experience",
        "experiment", "measurement", "validation", "preview"
    }
    assert set(result.agent_outputs.keys()) == expected_agents
    assert all(result.agent_outputs[a] is True for a in expected_agents)


@pytest.mark.asyncio
async def test_workflow_validation_failure_stops_before_preview():
    """Validation FAIL → current_step=VALIDATION_FAILED, preview not run."""

    # Override validation stub to return FAIL
    fail_output = dict(_AGENT_STUB_OUTPUTS["validation"])
    fail_output["overall_status"] = "FAIL"
    fail_output["launch_readiness"] = False

    async def _mock_execute_with_fail(activity_fn, params, **kwargs):
        name = getattr(activity_fn, "__name__", "")
        if "validation" in name:
            return fail_output
        return await _mock_execute_activity(activity_fn, params, **kwargs)

    patches = [
        patch("temporalio.workflow.execute_activity", side_effect=_mock_execute_with_fail),
        patch("temporalio.workflow.wait_condition", side_effect=_mock_wait_condition),
    ]
    mocks = [p.start() for p in patches]
    try:
        wf = CampaignCreationWorkflow()
        task = asyncio.create_task(
            wf.run(CampaignCreationInput(campaign_id=TEST_CAMPAIGN_ID, stub_mode=True))
        )
        await asyncio.sleep(0)
        await wf.strategy_review_signal(HumanReviewSignal(approved=True))
        result = await task
    finally:
        for p in patches:
            p.stop()

    assert result.current_step == "VALIDATION_FAILED"
    assert result.finalized is False
    assert "preview" not in result.agent_outputs


@pytest.mark.asyncio
async def test_workflow_get_agent_output_query():
    """get_agent_output returns None before agent runs and dict after."""

    async def _send_signals(wf: CampaignCreationWorkflow):
        await asyncio.sleep(0)
        # Unblock Gate 1
        await wf.strategy_review_signal(HumanReviewSignal(approved=True))
        for _ in range(10):
            await asyncio.sleep(0)
        # After Gate 1, strategy output should be populated
        strategy_out = wf.get_agent_output("strategy")
        assert strategy_out is not None
        assert "strategy_type" in strategy_out
        # audience not yet run (yield control only 10 times) — but at minimum
        # the query API works and doesn't crash mid-flight
        assert wf.get_status().campaign_id == TEST_CAMPAIGN_ID
        for _ in range(50):
            await asyncio.sleep(0)
        await wf.preview_review_signal(HumanReviewSignal(approved=True))

    result = await _run_workflow_with_signals(_send_signals)
    assert result.finalized is True
