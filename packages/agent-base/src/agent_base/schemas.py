"""Shared Pydantic schemas for all CampaignOS agents."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    model: str = "claude-haiku-4-5-20251001"
    critique_model: str = "claude-haiku-4-5-20251001"
    max_iterations: int = 2
    score_threshold: float = 3.5
    hard_minimum_score: float = 2.5
    per_run_token_budget: int = 10_000
    stub_mode: bool = False  # overridden by AGENT_LLM_STUB env var


class AgentInput(BaseModel):
    campaign_id: str = Field(..., description="UUID of the campaign being planned")
    upstream_outputs: dict[str, Any] = Field(
        default_factory=dict,
        description="Outputs from prior agents keyed by agent name",
    )
    config: AgentConfig = Field(default_factory=AgentConfig)


class DimensionScores(BaseModel):
    """Per-dimension critique scores (1-5 each). Agent-specific keys populated at runtime."""

    scores: dict[str, float] = Field(default_factory=dict)

    def overall(self) -> float:
        if not self.scores:
            return 0.0
        return sum(self.scores.values()) / len(self.scores)

    def weak_dimensions(self, threshold: float = 3.0) -> list[str]:
        return [k for k, v in self.scores.items() if v < threshold]


class CritiqueResult(BaseModel):
    dimension_scores: DimensionScores
    blocking_issues: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    overall_score: float = 0.0

    def model_post_init(self, __context: Any) -> None:
        if self.overall_score == 0.0:
            self.overall_score = self.dimension_scores.overall()


class AgentActionTaken(str, Enum):
    EMIT = "EMIT"
    REVISE = "REVISE"
    ESCALATE = "ESCALATE"


class AgentOutput(BaseModel):
    agent_name: str
    campaign_id: str
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    output: dict[str, Any] = Field(default_factory=dict)
    critique: CritiqueResult | None = None
    iterations: int = 0
    action_taken: AgentActionTaken = AgentActionTaken.EMIT
    low_confidence: bool = False
    budget_truncated: bool = False
    tokens_used: int = 0
    estimated_cost_usd: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentRunRecord(BaseModel):
    """Persisted record of a single agent run (written to agent_runs table)."""

    run_id: str
    campaign_id: str
    agent_name: str
    status: str  # RUNNING | COMPLETED | FAILED | ESCALATED
    iterations: int
    overall_score: float | None
    action_taken: str
    tokens_in: int
    tokens_out: int
    estimated_cost_usd: float
    low_confidence: bool
    budget_truncated: bool
    error_message: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class CrossValidationViolation(BaseModel):
    severity: str  # BLOCKER | WARNING | INFO
    violated_constraint: str
    affected_agents: list[str]
    suggested_fix: str


class CrossValidationRecord(BaseModel):
    campaign_id: str
    triggering_agent: str
    consistent: bool
    violations: list[CrossValidationViolation] = Field(default_factory=list)
    reroute_count: int = 0
    resolution: str | None = None
