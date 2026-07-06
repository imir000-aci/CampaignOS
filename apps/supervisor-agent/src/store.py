"""In-memory run store for the Agent Orchestration API.

Tracks active and completed agent pipeline runs, their status, telemetry,
and buffered SSE events. In production this would be backed by Postgres
(agent_runs + agent_telemetry tables), but an in-memory store is sufficient
for the prototype and enables the API layer to be fully testable without a DB.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RunStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    AWAITING_GATE1 = "AWAITING_GATE1"
    AWAITING_GATE2 = "AWAITING_GATE2"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    ESCALATED = "ESCALATED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


@dataclass
class ApprovalRequest:
    gate_type: str
    campaign_id: str
    payload: dict[str, Any]
    requested_at: float = field(default_factory=time.time)


@dataclass
class AgentRun:
    run_id: str
    campaign_id: str
    thread_id: str  # LangGraph checkpointer thread ID
    status: RunStatus
    agent_outputs: dict[str, Any] = field(default_factory=dict)
    current_step: str = "INITIALIZING"
    pending_approval: ApprovalRequest | None = None
    gate1_approved: bool | None = None
    gate2_approved: bool | None = None
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    estimated_cost_usd: float = 0.0
    tokens_used: int = 0
    # SSE event queue for streaming
    _event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "campaign_id": self.campaign_id,
            "thread_id": self.thread_id,
            "status": self.status.value,
            "agent_outputs": {k: bool(v) for k, v in self.agent_outputs.items()},
            "current_step": self.current_step,
            "gate1_approved": self.gate1_approved,
            "gate2_approved": self.gate2_approved,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "estimated_cost_usd": self.estimated_cost_usd,
            "tokens_used": self.tokens_used,
        }

    def approval_request_dict(self) -> dict[str, Any] | None:
        if not self.pending_approval:
            return None
        return {
            "gate_type": self.pending_approval.gate_type,
            "campaign_id": self.pending_approval.campaign_id,
            "payload": self.pending_approval.payload,
            "requested_at": self.pending_approval.requested_at,
        }


class RunStore:
    """Thread-safe in-memory store for agent runs."""

    def __init__(self) -> None:
        self._runs: dict[str, AgentRun] = {}
        self._lock = asyncio.Lock()

    def new_run(self, campaign_id: str) -> AgentRun:
        run_id = str(uuid.uuid4())
        thread_id = f"campaign-{campaign_id}-{run_id[:8]}"
        run = AgentRun(
            run_id=run_id,
            campaign_id=campaign_id,
            thread_id=thread_id,
            status=RunStatus.PENDING,
        )
        self._runs[run_id] = run
        return run

    def get(self, run_id: str) -> AgentRun | None:
        return self._runs.get(run_id)

    def list_runs(
        self,
        campaign_id: str | None = None,
        status: RunStatus | None = None,
        limit: int = 50,
    ) -> list[AgentRun]:
        runs = list(self._runs.values())
        if campaign_id:
            runs = [r for r in runs if r.campaign_id == campaign_id]
        if status:
            runs = [r for r in runs if r.status == status]
        # Most-recently started first
        runs.sort(key=lambda r: r.started_at, reverse=True)
        return runs[:limit]

    async def update(self, run: AgentRun, **kwargs) -> None:
        async with self._lock:
            for key, value in kwargs.items():
                setattr(run, key, value)

    async def emit_event(self, run: AgentRun, event_type: str, data: dict) -> None:
        """Push an SSE event onto the run's event queue."""
        await run._event_queue.put({"type": event_type, "data": data, "ts": time.time()})

    async def emit_done(self, run: AgentRun) -> None:
        """Signal that the SSE stream is complete."""
        await run._event_queue.put(None)


# Module-level singleton
run_store = RunStore()
