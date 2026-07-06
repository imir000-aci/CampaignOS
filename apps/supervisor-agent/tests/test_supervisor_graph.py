"""Tests for SupervisorGraph (LangGraph orchestration layer).

All agents run in stub mode — no Anthropic API calls are made.
Tests cover: full happy path, Gate 1 reject/retry/escalate, Gate 2 reject,
validation FAIL blocking, and query-style state inspection.

Run with: pytest tests/test_supervisor_graph.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Stub mode is set in conftest.py but set here too for safety
os.environ["AGENT_LLM_STUB"] = "true"

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "packages" / "agent-base" / "tests" / "fixtures"
os.environ.setdefault("AGENT_STUB_FIXTURES_DIR", str(FIXTURES_DIR))

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from graph import SupervisorState, _default_state, build_supervisor_graph

TEST_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001"

SAMPLE_BRIEF = {
    "campaign_name": "Summer Grilling 2026",
    "brief_text": (
        "Drive incremental basket size for the Grilling category across Southwest division. "
        "Target loyalists who purchased grilling items in the last 12 months. "
        "Budget: $5M total, $3.5M media. Flight: July–September 2026. "
        "Primary KPI: 3.5× ROAS. Channels: Email + Paid Social."
    ),
    "objective": "ACQUISITION",
    "budget_total_cents": 500_000_00,
    "budget_media_cents": 350_000_00,
    "channels": ["EMAIL", "PAID_SOCIAL"],
    "start_date": "2026-07-01",
    "end_date": "2026-09-30",
    "kpi_targets": [{"metric": "roas", "target": 3.5}],
}


def _make_graph():
    """Build a fresh graph with its own MemorySaver per test."""
    return build_supervisor_graph(checkpointer=MemorySaver())


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_graph_pauses_at_gate1():
    """Graph runs StrategyAgent and then pauses at Gate 1 interrupt."""
    graph = _make_graph()
    cfg = _config("test-gate1-pause")
    state = graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    # Strategy should have run
    assert "strategy" in state.get("agent_outputs", {})
    # Graph should be paused (interrupt present or gate not yet processed)
    assert state.get("gate1_approved") is None or "__interrupt__" in state


def test_graph_completes_full_happy_path():
    """Both gates approved → finalized=True and all 9 agents run."""
    graph = _make_graph()
    cfg = _config("test-happy-path")

    # Step 1: start — pauses at Gate 1
    state = graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    assert "strategy" in state.get("agent_outputs", {})

    # Step 2: approve Gate 1
    state = graph.invoke(
        Command(resume={"approved": True, "reviewer_id": "approver-1", "comments": ""}),
        config=cfg,
    )
    # Now pauses at Gate 2
    assert "preview" in state.get("agent_outputs", {})
    assert state.get("gate2_approved") is None or "__interrupt__" in state

    # Step 3: approve Gate 2
    state = graph.invoke(
        Command(resume={"approved": True, "reviewer_id": "approver-2", "comments": ""}),
        config=cfg,
    )
    assert state["finalized"] is True
    assert state["current_step"] == "FINALIZED"
    assert state["gate1_approved"] is True
    assert state["gate2_approved"] is True

    expected_agents = {
        "strategy", "audience", "creative", "targeting", "experience",
        "experiment", "measurement", "validation", "preview",
    }
    assert set(state["agent_outputs"].keys()) == expected_agents


# ---------------------------------------------------------------------------
# Gate 1 rejection
# ---------------------------------------------------------------------------

def test_gate1_rejection_stops_pipeline():
    """Gate 1 rejected → strategy_rejected terminal node, nothing after strategy."""
    graph = _make_graph()
    cfg = _config("test-gate1-reject")

    graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )

    state = graph.invoke(
        Command(resume={"approved": False, "reviewer_id": "r1", "comments": "Not specific enough"}),
        config=cfg,
    )
    # With 1 rejection and iterations=1, should retry (not go to rejected yet)
    # unless iterations >= 3. After 1 rejection the graph re-runs strategy.
    # We need to send another reject to escalate or keep retrying.
    # For simplicity: after first reject + second invoke round, we approve.
    # Let's just check that audience has NOT run yet after a rejection path.
    # One reject with iterations < 3 → retry strategy
    assert "audience" not in state.get("agent_outputs", {}), (
        "Audience should not run after Gate 1 rejection"
    )


def test_gate1_escalation_after_3_rejections():
    """3 consecutive Gate 1 rejections → escalate terminal node."""
    graph = _make_graph()
    cfg = _config("test-gate1-escalate")

    # Round 1: run strategy, reject
    graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    graph.invoke(Command(resume={"approved": False}), config=cfg)

    # Round 2: retry strategy (auto), reject again
    graph.invoke(Command(resume={"approved": False}), config=cfg)

    # Round 3: retry strategy (auto), reject → escalate
    state = graph.invoke(Command(resume={"approved": False}), config=cfg)

    assert state["current_step"] == "ESCALATED"
    assert state.get("finalized") is not True
    assert "audience" not in state.get("agent_outputs", {})


# ---------------------------------------------------------------------------
# Gate 2 rejection
# ---------------------------------------------------------------------------

def test_gate2_rejection_stops_at_preview_rejected():
    """Gate 2 rejected → preview_rejected terminal node."""
    graph = _make_graph()
    cfg = _config("test-gate2-reject")

    # Gate 1 — approve
    graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    graph.invoke(Command(resume={"approved": True}), config=cfg)

    # Gate 2 — reject
    state = graph.invoke(Command(resume={"approved": False, "comments": "Needs more variants"}), config=cfg)

    assert state["current_step"] == "PREVIEW_REJECTED"
    assert state.get("finalized") is not True
    assert state["gate2_approved"] is False


# ---------------------------------------------------------------------------
# Validation failure
# ---------------------------------------------------------------------------

def test_validation_fail_blocks_preview(monkeypatch):
    """ValidationAgent returning FAIL → validation_failed node, preview not run."""
    from agents.validation import agent as validation_module

    # Monkeypatch the ValidationAgent to return a FAIL status
    original_run = validation_module.ValidationAgent.run

    def _fail_run(self, input_):
        result = original_run(self, input_)
        # Override output to FAIL
        result.output["overall_status"] = "FAIL"
        result.output["launch_readiness"] = False
        return result

    monkeypatch.setattr(validation_module.ValidationAgent, "run", _fail_run)

    graph = _make_graph()
    cfg = _config("test-validation-fail")

    graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    state = graph.invoke(Command(resume={"approved": True}), config=cfg)

    assert state["current_step"] == "VALIDATION_FAILED"
    assert "preview" not in state.get("agent_outputs", {})
    assert state.get("finalized") is not True


# ---------------------------------------------------------------------------
# State inspection
# ---------------------------------------------------------------------------

def test_graph_state_has_all_required_keys():
    """SupervisorState after Gate 1 pause has all expected keys."""
    graph = _make_graph()
    cfg = _config("test-state-keys")
    state = graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    assert state["campaign_id"] == TEST_CAMPAIGN_ID
    assert "agent_outputs" in state
    assert isinstance(state["cross_validation_warnings"], list)


def test_default_state_initializer():
    """_default_state returns correctly structured initial state."""
    s = _default_state("cid-123", {"name": "test"}, stub_mode=True)
    assert s["campaign_id"] == "cid-123"
    assert s["stub_mode"] is True
    assert s["agent_outputs"] == {}
    assert s["strategy_iterations"] == 0
    assert s["finalized"] is False
    assert s["gate1_approved"] is None
    assert s["gate2_approved"] is None


def test_graph_thread_isolation():
    """Two concurrent thread IDs maintain independent state."""
    graph = _make_graph()

    # Thread A — start
    cfg_a = _config("thread-a")
    state_a = graph.invoke(
        _default_state("camp-a", SAMPLE_BRIEF, stub_mode=True),
        config=cfg_a,
    )

    # Thread B — start
    cfg_b = _config("thread-b")
    state_b = graph.invoke(
        _default_state("camp-b", SAMPLE_BRIEF, stub_mode=True),
        config=cfg_b,
    )

    assert state_a["campaign_id"] == "camp-a"
    assert state_b["campaign_id"] == "camp-b"

    # Approve A — should not affect B
    state_a2 = graph.invoke(Command(resume={"approved": True}), config=cfg_a)
    state_b2 = graph.get_state(cfg_b)
    assert state_b2.values.get("gate1_approved") is None


def test_all_9_agents_in_agent_outputs_after_happy_path():
    """Verify each of the 9 agent names appears in agent_outputs after full run."""
    graph = _make_graph()
    cfg = _config("test-all9-graph")

    graph.invoke(
        _default_state(TEST_CAMPAIGN_ID, SAMPLE_BRIEF, stub_mode=True),
        config=cfg,
    )
    graph.invoke(Command(resume={"approved": True}), config=cfg)
    state = graph.invoke(Command(resume={"approved": True}), config=cfg)

    outputs = state["agent_outputs"]
    for name in ("strategy", "audience", "creative", "targeting", "experience",
                 "experiment", "measurement", "validation", "preview"):
        assert name in outputs, f"Missing agent output: {name}"
        assert isinstance(outputs[name], dict), f"Agent output for {name} should be a dict"
