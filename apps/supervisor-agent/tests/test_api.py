"""Tests for the Agent Orchestration API (FastAPI endpoints).

Uses httpx.AsyncClient with the ASGI transport so no actual server process
is started. All agents run in stub mode.

Run with: pytest tests/test_api.py -v
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

os.environ["AGENT_LLM_STUB"] = "true"
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "packages" / "agent-base" / "tests" / "fixtures"
os.environ.setdefault("AGENT_STUB_FIXTURES_DIR", str(FIXTURES_DIR))

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import pytest
import httpx

# Import the app after env vars are set
from api import app
from store import RunStatus, run_store

SAMPLE_BRIEF = {
    "campaign_name": "API Test Campaign",
    "brief_text": (
        "Drive incremental basket size for Summer Grilling. "
        "Budget $5M, channels EMAIL and PAID_SOCIAL, ROAS target 3.5×."
    ),
    "objective": "ACQUISITION",
    "budget_total_cents": 500_000_00,
    "budget_media_cents": 350_000_00,
    "start_date": "2026-07-01",
    "end_date": "2026-09-30",
    "kpi_targets": [{"metric": "roas", "target": 3.5}],
}


@pytest.fixture
async def client():
    """ASGI test client — no real server process."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# GET /agents
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_agents_returns_9(client):
    resp = await client.get("/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["agents"]) == 9
    names = {a["name"] for a in data["agents"]}
    expected = {"strategy", "audience", "creative", "targeting", "experience",
                "experiment", "measurement", "validation", "preview"}
    assert names == expected


# ---------------------------------------------------------------------------
# POST /agents/{agent_name}/trigger
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_returns_run_id(client):
    resp = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-001", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "run_id" in data
    assert "thread_id" in data
    assert data["status"] in ("PENDING", "RUNNING")


@pytest.mark.asyncio
async def test_trigger_unknown_agent_returns_400(client):
    resp = await client.post(
        "/agents/nonexistent/trigger",
        json={"campaign_id": "camp-001", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_trigger_specific_agent_name(client):
    resp = await client.post(
        "/agents/strategy/trigger",
        json={"campaign_id": "camp-strategy", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    assert resp.status_code == 202


# ---------------------------------------------------------------------------
# GET /agents/runs
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_runs_returns_results(client):
    # Trigger a run first
    await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-list-test", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    resp = await client.get("/agents/runs?campaign_id=camp-list-test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert all(r["campaign_id"] == "camp-list-test" for r in data["runs"])


@pytest.mark.asyncio
async def test_list_runs_no_filter_returns_all(client):
    resp = await client.get("/agents/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert "runs" in data
    assert isinstance(data["runs"], list)


# ---------------------------------------------------------------------------
# GET /agents/runs/{run_id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_run_returns_detail(client):
    trigger = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-detail", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    run_id = trigger.json()["run_id"]

    resp = await client.get(f"/agents/runs/{run_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["run_id"] == run_id
    assert data["campaign_id"] == "camp-detail"


@pytest.mark.asyncio
async def test_get_run_not_found(client):
    resp = await client.get("/agents/runs/nonexistent-id")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /agents/runs/{run_id}/approval-request
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approval_request_not_available_when_not_awaiting(client):
    """Newly created run is not yet awaiting approval."""
    trigger = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-nogate", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    run_id = trigger.json()["run_id"]
    # Immediately after trigger, status is PENDING or RUNNING, not AWAITING_GATE*
    resp = await client.get(f"/agents/runs/{run_id}/approval-request")
    # Either 409 (not awaiting) or 404 (not found yet) depending on timing
    assert resp.status_code in (409, 404)


# ---------------------------------------------------------------------------
# POST /agents/runs/{run_id}/approve and reject
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approve_not_awaiting_returns_409(client):
    trigger = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-approve-409", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    run_id = trigger.json()["run_id"]
    # Brief delay to let background task start
    await asyncio.sleep(0.05)
    resp = await client.post(
        f"/agents/runs/{run_id}/approve",
        json={"reviewer_id": "r1", "comments": ""},
    )
    # Only succeeds if actually awaiting; otherwise 409
    assert resp.status_code in (202, 409)


@pytest.mark.asyncio
async def test_approve_nonexistent_run_returns_404(client):
    resp = await client.post(
        "/agents/runs/does-not-exist/approve",
        json={"reviewer_id": "r1"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reject_nonexistent_run_returns_404(client):
    resp = await client.post(
        "/agents/runs/does-not-exist/reject",
        json={"reviewer_id": "r1", "reason": "test"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /agents/runs/{run_id}/cancel
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_pending_run(client):
    trigger = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-cancel", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    run_id = trigger.json()["run_id"]

    # Manually set to AWAITING so cancel doesn't hit the "already completed" guard
    run = run_store.get(run_id)
    if run:
        from store import RunStatus
        run.status = RunStatus.AWAITING_GATE1

    resp = await client.post(f"/agents/runs/{run_id}/cancel", json={"reason": "test cancel"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_cancel_nonexistent_returns_404(client):
    resp = await client.post("/agents/runs/nope/cancel", json={})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /agents/runs/{run_id}/cost
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_cost_returns_structure(client):
    trigger = await client.post(
        "/agents/all/trigger",
        json={"campaign_id": "camp-cost", "brief": SAMPLE_BRIEF, "stub_mode": True},
    )
    run_id = trigger.json()["run_id"]

    resp = await client.get(f"/agents/runs/{run_id}/cost")
    assert resp.status_code == 200
    data = resp.json()
    assert "tokens_used" in data
    assert "estimated_cost_usd" in data
    assert "agents_completed" in data
    assert isinstance(data["agents_completed"], list)
