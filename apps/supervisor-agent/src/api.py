"""Agent Orchestration API — FastAPI application for CampaignOS supervisor.

Routes (per architecture plan Section 6.12):
  GET  /agents                          — Agent definitions
  POST /agents/{agent_name}/trigger     — Trigger full pipeline (agent_name can be "all")
  GET  /agents/runs                     — List runs (filter by campaign_id, status)
  GET  /agents/runs/{run_id}            — Full run detail
  GET  /agents/runs/{run_id}/stream     — SSE event stream
  POST /agents/runs/{run_id}/cancel     — Cancel run
  GET  /agents/runs/{run_id}/approval-request — Current human gate payload
  POST /agents/runs/{run_id}/approve    — Approve current gate → resume graph
  POST /agents/runs/{run_id}/reject     — Reject current gate → resume graph
  GET  /agents/runs/{run_id}/cost       — Token + cost summary

The supervisor graph is started as a background asyncio task; the API returns
a run_id immediately so the caller can poll or subscribe to the SSE stream.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command
from pydantic import BaseModel

from graph import SupervisorState, _default_state, build_supervisor_graph
from store import AgentRun, RunStatus, RunStore, run_store

logger = logging.getLogger(__name__)

app = FastAPI(
    title="CampaignOS Agent Orchestration API",
    version="0.1.0",
    description="Supervisor agent REST API — start, monitor, and gate-approve campaign pipelines.",
)

# Shared LangGraph graph with MemorySaver (replace with PostgresSaver in production)
_checkpointer = MemorySaver()
_graph = build_supervisor_graph(checkpointer=_checkpointer)

# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------

AGENT_DEFINITIONS = [
    {"name": "strategy",    "model": "claude-opus-4-8",         "step": 1,  "parallel_group": None},
    {"name": "audience",    "model": "claude-sonnet-5",         "step": 3,  "parallel_group": None},
    {"name": "creative",    "model": "claude-sonnet-5",         "step": "4a", "parallel_group": "creative_targeting"},
    {"name": "targeting",   "model": "claude-haiku-4-5",        "step": "4b", "parallel_group": "creative_targeting"},
    {"name": "experience",  "model": "claude-sonnet-5",         "step": 5,  "parallel_group": None},
    {"name": "experiment",  "model": "claude-haiku-4-5",        "step": "6a", "parallel_group": "experiment_measurement"},
    {"name": "measurement", "model": "claude-haiku-4-5",        "step": "6b", "parallel_group": "experiment_measurement"},
    {"name": "validation",  "model": "claude-haiku-4-5",        "step": 7,  "parallel_group": None},
    {"name": "preview",     "model": "claude-haiku-4-5",        "step": 8,  "parallel_group": None},
]


class TriggerRequest(BaseModel):
    campaign_id: str
    brief: dict[str, Any]
    stub_mode: bool = False


class ApproveRequest(BaseModel):
    reviewer_id: str = ""
    comments: str = ""


class RejectRequest(BaseModel):
    reviewer_id: str = ""
    comments: str = ""
    reason: str = ""


class CancelRequest(BaseModel):
    reason: str = ""


# ---------------------------------------------------------------------------
# Background pipeline runner
# ---------------------------------------------------------------------------

async def _run_pipeline(run: AgentRun, initial_state: SupervisorState, store: RunStore) -> None:
    """Execute the supervisor graph in a background task.

    The graph pauses at human gates (interrupt()); those pauses are surfaced as
    AWAITING_GATE1/AWAITING_GATE2 status updates. Callers resume via the
    /approve or /reject endpoints which call _resume_pipeline().
    """
    config = {"configurable": {"thread_id": run.thread_id}}
    await store.update(run, status=RunStatus.RUNNING)
    await store.emit_event(run, "pipeline_started", {"run_id": run.run_id})

    try:
        state = _graph.invoke(initial_state, config=config)
        await _sync_run_from_state(run, state, store)
    except Exception as exc:
        logger.exception("Pipeline failed run_id=%s", run.run_id)
        await store.update(run, status=RunStatus.FAILED, error=str(exc))
        await store.emit_event(run, "pipeline_failed", {"error": str(exc)})
    finally:
        await store.emit_done(run)


async def _resume_pipeline(run: AgentRun, resume_value: dict, store: RunStore) -> None:
    """Resume a paused pipeline with a gate decision."""
    config = {"configurable": {"thread_id": run.thread_id}}
    await store.update(run, status=RunStatus.RUNNING, pending_approval=None)
    await store.emit_event(run, "gate_resumed", {"resume": resume_value})

    try:
        state = _graph.invoke(Command(resume=resume_value), config=config)
        await _sync_run_from_state(run, state, store)
    except Exception as exc:
        logger.exception("Resume failed run_id=%s", run.run_id)
        await store.update(run, status=RunStatus.FAILED, error=str(exc))
        await store.emit_event(run, "pipeline_failed", {"error": str(exc)})
    finally:
        await store.emit_done(run)


def _compute_cost_totals(agent_costs: dict) -> tuple[int, float]:
    """Sum tokens_used and estimated_cost_usd across all completed agents."""
    total_tokens = sum(c.get("tokens_used", 0) for c in agent_costs.values())
    total_cost = sum(c.get("estimated_cost_usd", 0.0) for c in agent_costs.values())
    return total_tokens, round(total_cost, 6)


async def _sync_run_from_state(run: AgentRun, state: dict, store: RunStore) -> None:
    """Update the run record from a returned LangGraph state."""
    agent_outputs = state.get("agent_outputs", {})
    current_step = state.get("current_step", "")
    agent_costs = state.get("agent_costs", {})
    total_tokens, total_cost = _compute_cost_totals(agent_costs)

    # Determine new status
    if "__interrupt__" in state:
        interrupts = state["__interrupt__"]
        gate = interrupts[0].value if interrupts else {}
        gate_type = gate.get("gate_type", "")
        from store import ApprovalRequest
        new_status = RunStatus.AWAITING_GATE1 if gate_type == "STRATEGY_REVIEW" else RunStatus.AWAITING_GATE2
        pending = ApprovalRequest(
            gate_type=gate_type,
            campaign_id=run.campaign_id,
            payload=gate,
        )
        await store.update(
            run,
            status=new_status,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
            pending_approval=pending,
        )
        await store.emit_event(run, "awaiting_approval", pending.approval_request_dict() or {})
    elif current_step == "FINALIZED":
        await store.update(
            run,
            status=RunStatus.COMPLETED,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
            completed_at=time.time(),
            gate1_approved=state.get("gate1_approved"),
            gate2_approved=state.get("gate2_approved"),
        )
        await store.emit_event(run, "pipeline_completed", {"current_step": current_step})
    elif current_step in ("STRATEGY_REJECTED", "PREVIEW_REJECTED"):
        await store.update(
            run,
            status=RunStatus.REJECTED,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
            completed_at=time.time(),
            gate1_approved=state.get("gate1_approved"),
            gate2_approved=state.get("gate2_approved"),
        )
        await store.emit_event(run, "pipeline_rejected", {"current_step": current_step})
    elif current_step == "VALIDATION_FAILED":
        await store.update(
            run,
            status=RunStatus.VALIDATION_FAILED,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
            completed_at=time.time(),
        )
        await store.emit_event(run, "validation_failed", {})
    elif current_step == "ESCALATED":
        await store.update(
            run,
            status=RunStatus.ESCALATED,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
            completed_at=time.time(),
        )
        await store.emit_event(run, "escalated", {})
    else:
        # In-progress state update
        await store.update(
            run,
            agent_outputs=agent_outputs,
            agent_costs=agent_costs,
            tokens_used=total_tokens,
            estimated_cost_usd=total_cost,
            current_step=current_step,
        )
        await store.emit_event(run, "step_completed", {"current_step": current_step})


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/agents")
async def list_agents() -> dict:
    """Return agent definitions and their position in the pipeline."""
    return {"agents": AGENT_DEFINITIONS}


@app.post("/agents/{agent_name}/trigger", status_code=202)
async def trigger_pipeline(
    agent_name: str,
    body: TriggerRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Start the full campaign pipeline (agent_name is recorded for context).

    Returns immediately with run_id. Poll GET /agents/runs/{run_id} or
    subscribe to GET /agents/runs/{run_id}/stream for progress.
    """
    valid_names = {a["name"] for a in AGENT_DEFINITIONS} | {"all"}
    if agent_name not in valid_names:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {agent_name}")

    run = run_store.new_run(body.campaign_id)
    initial_state = _default_state(
        campaign_id=body.campaign_id,
        brief=body.brief,
        stub_mode=body.stub_mode,
    )

    background_tasks.add_task(_run_pipeline, run, initial_state, run_store)
    return {"run_id": run.run_id, "thread_id": run.thread_id, "status": run.status.value}


@app.get("/agents/runs")
async def list_runs(
    campaign_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
) -> dict:
    """List agent runs with optional campaign_id and status filters."""
    status_enum = RunStatus(status) if status else None
    runs = run_store.list_runs(campaign_id=campaign_id, status=status_enum, limit=limit)
    return {"runs": [r.to_dict() for r in runs], "total": len(runs)}


@app.get("/agents/runs/{run_id}")
async def get_run(run_id: str) -> dict:
    """Return full run detail including agent output completion map."""
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.to_dict()


@app.get("/agents/runs/{run_id}/stream")
async def stream_run_events(run_id: str) -> StreamingResponse:
    """SSE stream of pipeline events for this run.

    Clients consume this with EventSource to get real-time step updates and
    gate prompts without polling.

    Format: text/event-stream with `data: <json>\\n\\n` lines.
    Terminates when the pipeline completes, fails, or is cancelled.
    """
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def _event_generator():
        while True:
            event = await asyncio.wait_for(run._event_queue.get(), timeout=30.0)
            if event is None:
                yield "event: done\ndata: {}\n\n"
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/agents/runs/{run_id}/cancel", status_code=200)
async def cancel_run(run_id: str, body: CancelRequest) -> dict:
    """Cancel a pending or running pipeline.

    Note: this updates the run status in the store; it does not interrupt
    an in-flight graph invocation (Temporal handles that for durable runs).
    """
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Run is already {run.status.value}")
    await run_store.update(run, status=RunStatus.CANCELLED, error=body.reason or "Cancelled")
    await run_store.emit_done(run)
    return {"run_id": run_id, "status": RunStatus.CANCELLED.value}


@app.get("/agents/runs/{run_id}/approval-request")
async def get_approval_request(run_id: str) -> dict:
    """Return the current human gate payload if the run is awaiting approval."""
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.AWAITING_GATE1, RunStatus.AWAITING_GATE2):
        raise HTTPException(status_code=409, detail=f"Run is not awaiting approval (status={run.status.value})")
    return {"approval_request": run.approval_request_dict()}


@app.post("/agents/runs/{run_id}/approve", status_code=202)
async def approve_run(
    run_id: str,
    body: ApproveRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Approve the current human gate and resume the pipeline."""
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.AWAITING_GATE1, RunStatus.AWAITING_GATE2):
        raise HTTPException(status_code=409, detail=f"Run is not awaiting approval (status={run.status.value})")

    resume_value = {
        "approved": True,
        "reviewer_id": body.reviewer_id,
        "comments": body.comments,
    }
    # Refresh the event queue for new events from the resumed graph
    import asyncio
    run._event_queue = asyncio.Queue()
    background_tasks.add_task(_resume_pipeline, run, resume_value, run_store)
    return {"run_id": run_id, "status": "RESUMING"}


@app.post("/agents/runs/{run_id}/reject", status_code=202)
async def reject_run(
    run_id: str,
    body: RejectRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Reject the current human gate and resume the pipeline (may retry or terminate)."""
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.AWAITING_GATE1, RunStatus.AWAITING_GATE2):
        raise HTTPException(status_code=409, detail=f"Run is not awaiting approval (status={run.status.value})")

    resume_value = {
        "approved": False,
        "reviewer_id": body.reviewer_id,
        "comments": body.comments,
        "reason": body.reason,
    }
    import asyncio
    run._event_queue = asyncio.Queue()
    background_tasks.add_task(_resume_pipeline, run, resume_value, run_store)
    return {"run_id": run_id, "status": "RESUMING"}


@app.get("/agents/runs/{run_id}/cost")
async def get_run_cost(run_id: str) -> dict:
    """Return token usage and estimated cost for this run, including per-agent breakdown."""
    run = run_store.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run_id,
        "tokens_used": run.tokens_used,
        "estimated_cost_usd": run.estimated_cost_usd,
        "agents_completed": list(run.agent_outputs.keys()),
        "per_agent_costs": run.agent_costs,
    }
