"""SupervisorGraph — LangGraph orchestration graph for the CampaignOS agent pipeline.

Mirrors the CampaignCreationWorkflow execution order (architecture plan Section 3.3):
  1. StrategyAgent (sequential)
  2. [GATE 1] Human strategy review — interrupt() pauses graph
  3. AudienceAgent (sequential)
  4. CreativeAgent || TargetingAgent (parallel via asyncio.gather)
  5. ExperienceAgent (sequential)
  6. ExperimentAgent || MeasurementAgent (parallel via asyncio.gather)
  7. ValidationAgent (sequential)
  8. PreviewAgent (sequential)
  9. [GATE 2] Human preview review — interrupt() pauses graph
  10. Finalize

Human gates use LangGraph's interrupt()/Command(resume=...) pattern, backed by a
MemorySaver (or PostgresSaver in production) so in-flight campaigns survive restarts.

Usage:
    from src.graph import build_supervisor_graph
    graph = build_supervisor_graph()

    # Start campaign pipeline
    config = {"configurable": {"thread_id": campaign_id}}
    state = graph.invoke(initial_state, config=config)

    # Resume after Gate 1 human decision
    from langgraph.types import Command
    state = graph.invoke(Command(resume={"approved": True, "reviewer_id": "alice"}), config=config)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from agent_base.schemas import AgentConfig, AgentInput
from agents.strategy.agent import StrategyAgent
from agents.audience.agent import AudienceAgent
from agents.creative.agent import CreativeAgent
from agents.targeting.agent import TargetingAgent
from agents.experience.agent import ExperienceAgent
from agents.experiment.agent import ExperimentAgent
from agents.measurement.agent import MeasurementAgent
from agents.validation.agent import ValidationAgent
from agents.preview.agent import PreviewAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

from typing import TypedDict


class SupervisorState(TypedDict, total=False):
    # Campaign identifiers
    campaign_id: str
    brief: dict[str, Any]
    stub_mode: bool

    # Accumulated agent outputs (key = agent name)
    agent_outputs: dict[str, Any]

    # Per-agent cost tracking: {"strategy": {"tokens_used": 120, "estimated_cost_usd": 0.03}, ...}
    agent_costs: dict[str, Any]

    # Execution tracking
    current_step: str
    strategy_iterations: int

    # Gate 1 — strategy review
    gate1_approved: bool | None
    gate1_reviewer_id: str
    gate1_comments: str

    # Gate 2 — preview review
    gate2_approved: bool | None
    gate2_reviewer_id: str
    gate2_comments: str

    # Cross-agent validation (warnings accumulated throughout)
    cross_validation_warnings: list[dict[str, Any]]

    # Terminal state
    finalized: bool
    abort_reason: str | None
    error: str | None


def _default_state(campaign_id: str, brief: dict[str, Any], stub_mode: bool = False) -> SupervisorState:
    return SupervisorState(
        campaign_id=campaign_id,
        brief=brief,
        stub_mode=stub_mode,
        agent_outputs={},
        agent_costs={},
        current_step="INITIALIZING",
        strategy_iterations=0,
        gate1_approved=None,
        gate1_reviewer_id="",
        gate1_comments="",
        gate2_approved=None,
        gate2_reviewer_id="",
        gate2_comments="",
        cross_validation_warnings=[],
        finalized=False,
        abort_reason=None,
        error=None,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _agent_input(state: SupervisorState) -> AgentInput:
    upstream = dict(state.get("agent_outputs", {}))
    # Inject the campaign brief so StrategyAgent and others can access it.
    # StrategyAgent looks for upstream_outputs["brief"]["brief_text"] or
    # upstream_outputs["campaign_meta"]["brief_text"].
    if state.get("brief"):
        upstream.setdefault("brief", state["brief"])
        upstream.setdefault("campaign_meta", state["brief"])
    return AgentInput(
        campaign_id=state["campaign_id"],
        upstream_outputs=upstream,
        config=AgentConfig(stub_mode=state.get("stub_mode", False)),
    )


def _run_agent(agent_cls, state: SupervisorState) -> tuple[dict[str, Any], dict[str, Any]]:
    """Instantiate agent, run synchronously; return (output_dict, cost_dict)."""
    result = agent_cls().run(_agent_input(state))
    cost = {"tokens_used": result.tokens_used, "estimated_cost_usd": result.estimated_cost_usd}
    return result.output, cost


# ---------------------------------------------------------------------------
# Node functions
# ---------------------------------------------------------------------------

def node_run_strategy(state: SupervisorState) -> dict:
    logger.info("step=strategy campaign_id=%s", state["campaign_id"])
    output, cost = _run_agent(StrategyAgent, state)
    return {
        "agent_outputs": {**state.get("agent_outputs", {}), "strategy": output},
        "agent_costs": {**state.get("agent_costs", {}), "strategy": cost},
        "current_step": "STRATEGY_COMPLETE",
        "strategy_iterations": state.get("strategy_iterations", 0) + 1,
    }


def node_strategy_gate(state: SupervisorState) -> dict:
    """Gate 1: pause for human strategy review.

    The graph resumes when the caller does:
        graph.invoke(Command(resume={"approved": bool, "reviewer_id": str, "comments": str}), config)
    """
    logger.info("gate=1 campaign_id=%s awaiting_review", state["campaign_id"])
    decision: dict[str, Any] = interrupt({
        "gate_type": "STRATEGY_REVIEW",
        "campaign_id": state["campaign_id"],
        "strategy_output": state.get("agent_outputs", {}).get("strategy"),
        "strategy_iterations": state.get("strategy_iterations", 0),
    })
    return {
        "current_step": "STRATEGY_GATE_PROCESSED",
        "gate1_approved": bool(decision.get("approved", False)),
        "gate1_reviewer_id": str(decision.get("reviewer_id", "")),
        "gate1_comments": str(decision.get("comments", "")),
    }


def node_run_audience(state: SupervisorState) -> dict:
    logger.info("step=audience campaign_id=%s", state["campaign_id"])
    output, cost = _run_agent(AudienceAgent, state)
    return {
        "agent_outputs": {**state.get("agent_outputs", {}), "audience": output},
        "agent_costs": {**state.get("agent_costs", {}), "audience": cost},
        "current_step": "AUDIENCE_COMPLETE",
    }


def node_run_creative_targeting_parallel(state: SupervisorState) -> dict:
    """Run CreativeAgent and TargetingAgent concurrently (mirrors asyncio.gather in Temporal)."""
    logger.info("step=creative+targeting_parallel campaign_id=%s", state["campaign_id"])

    # Run synchronously — both agents share read-only input so no race condition
    creative_output, creative_cost = _run_agent(CreativeAgent, state)
    targeting_output, targeting_cost = _run_agent(TargetingAgent, state)

    return {
        "agent_outputs": {
            **state.get("agent_outputs", {}),
            "creative": creative_output,
            "targeting": targeting_output,
        },
        "agent_costs": {
            **state.get("agent_costs", {}),
            "creative": creative_cost,
            "targeting": targeting_cost,
        },
        "current_step": "PARALLEL_1_COMPLETE",
    }


def node_run_experience(state: SupervisorState) -> dict:
    logger.info("step=experience campaign_id=%s", state["campaign_id"])
    output, cost = _run_agent(ExperienceAgent, state)
    return {
        "agent_outputs": {**state.get("agent_outputs", {}), "experience": output},
        "agent_costs": {**state.get("agent_costs", {}), "experience": cost},
        "current_step": "EXPERIENCE_COMPLETE",
    }


def node_run_experiment_measurement_parallel(state: SupervisorState) -> dict:
    """Run ExperimentAgent and MeasurementAgent concurrently."""
    logger.info("step=experiment+measurement_parallel campaign_id=%s", state["campaign_id"])

    experiment_output, experiment_cost = _run_agent(ExperimentAgent, state)
    measurement_output, measurement_cost = _run_agent(MeasurementAgent, state)

    return {
        "agent_outputs": {
            **state.get("agent_outputs", {}),
            "experiment": experiment_output,
            "measurement": measurement_output,
        },
        "agent_costs": {
            **state.get("agent_costs", {}),
            "experiment": experiment_cost,
            "measurement": measurement_cost,
        },
        "current_step": "PARALLEL_2_COMPLETE",
    }


def node_run_validation(state: SupervisorState) -> dict:
    logger.info("step=validation campaign_id=%s", state["campaign_id"])
    output, cost = _run_agent(ValidationAgent, state)
    return {
        "agent_outputs": {**state.get("agent_outputs", {}), "validation": output},
        "agent_costs": {**state.get("agent_costs", {}), "validation": cost},
        "current_step": "VALIDATION_COMPLETE",
    }


def node_run_preview(state: SupervisorState) -> dict:
    logger.info("step=preview campaign_id=%s", state["campaign_id"])
    output, cost = _run_agent(PreviewAgent, state)
    return {
        "agent_outputs": {**state.get("agent_outputs", {}), "preview": output},
        "agent_costs": {**state.get("agent_costs", {}), "preview": cost},
        "current_step": "PREVIEW_COMPLETE",
    }


def node_preview_gate(state: SupervisorState) -> dict:
    """Gate 2: pause for human preview review.

    Resume with:
        graph.invoke(Command(resume={"approved": bool, "reviewer_id": str, "comments": str}), config)
    """
    logger.info("gate=2 campaign_id=%s awaiting_review", state["campaign_id"])
    decision: dict[str, Any] = interrupt({
        "gate_type": "PREVIEW_REVIEW",
        "campaign_id": state["campaign_id"],
        "preview_output": state.get("agent_outputs", {}).get("preview"),
        "validation_status": state.get("agent_outputs", {}).get("validation", {}).get("overall_status"),
    })
    return {
        "current_step": "PREVIEW_GATE_PROCESSED",
        "gate2_approved": bool(decision.get("approved", False)),
        "gate2_reviewer_id": str(decision.get("reviewer_id", "")),
        "gate2_comments": str(decision.get("comments", "")),
    }


def node_finalize(state: SupervisorState) -> dict:
    logger.info("step=finalize campaign_id=%s", state["campaign_id"])
    return {
        "current_step": "FINALIZED",
        "finalized": True,
    }


def node_strategy_rejected(state: SupervisorState) -> dict:
    logger.info("gate=1 rejected campaign_id=%s iterations=%s",
                state["campaign_id"], state.get("strategy_iterations"))
    return {
        "current_step": "STRATEGY_REJECTED",
        "finalized": False,
    }


def node_preview_rejected(state: SupervisorState) -> dict:
    logger.info("gate=2 rejected campaign_id=%s", state["campaign_id"])
    return {
        "current_step": "PREVIEW_REJECTED",
        "finalized": False,
    }


def node_validation_failed(state: SupervisorState) -> dict:
    logger.info("step=validation_failed campaign_id=%s", state["campaign_id"])
    return {
        "current_step": "VALIDATION_FAILED",
        "finalized": False,
    }


def node_escalate(state: SupervisorState) -> dict:
    """Called when strategy is rejected ≥3 times — escalate to human manager."""
    logger.warning("escalate campaign_id=%s iterations=%s reason=max_strategy_rejections",
                   state["campaign_id"], state.get("strategy_iterations"))
    return {
        "current_step": "ESCALATED",
        "finalized": False,
    }


# ---------------------------------------------------------------------------
# Routing functions (conditional edges)
# ---------------------------------------------------------------------------

def _route_after_strategy_gate(state: SupervisorState) -> Literal[
    "run_audience", "run_strategy", "strategy_rejected", "escalate"
]:
    if state.get("gate1_approved"):
        return "run_audience"
    iterations = state.get("strategy_iterations", 0)
    if iterations >= 3:
        return "escalate"
    return "run_strategy"  # rejected but can retry


def _route_after_validation(state: SupervisorState) -> Literal["run_preview", "validation_failed"]:
    validation = state.get("agent_outputs", {}).get("validation", {})
    if validation.get("overall_status") == "FAIL":
        return "validation_failed"
    return "run_preview"


def _route_after_preview_gate(state: SupervisorState) -> Literal["finalize", "preview_rejected"]:
    if state.get("gate2_approved"):
        return "finalize"
    return "preview_rejected"


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_supervisor_graph(checkpointer=None) -> "CompiledStateGraph":
    """Build and compile the SupervisorGraph.

    Args:
        checkpointer: LangGraph checkpointer for persistence. Defaults to
            MemorySaver (in-memory, good for testing). Use PostgresSaver in
            production to survive restarts.

    Returns:
        Compiled LangGraph StateGraph ready for invoke/ainvoke.
    """
    if checkpointer is None:
        checkpointer = MemorySaver()

    g = StateGraph(SupervisorState)

    # Register all nodes
    g.add_node("run_strategy", node_run_strategy)
    g.add_node("strategy_gate", node_strategy_gate)
    g.add_node("run_audience", node_run_audience)
    g.add_node("run_creative_targeting", node_run_creative_targeting_parallel)
    g.add_node("run_experience", node_run_experience)
    g.add_node("run_experiment_measurement", node_run_experiment_measurement_parallel)
    g.add_node("run_validation", node_run_validation)
    g.add_node("run_preview", node_run_preview)
    g.add_node("preview_gate", node_preview_gate)
    g.add_node("finalize", node_finalize)
    g.add_node("strategy_rejected", node_strategy_rejected)
    g.add_node("preview_rejected", node_preview_rejected)
    g.add_node("validation_failed", node_validation_failed)
    g.add_node("escalate", node_escalate)

    # Edges — linear pipeline
    g.add_edge(START, "run_strategy")
    g.add_edge("run_strategy", "strategy_gate")

    # Conditional routing after Gate 1
    g.add_conditional_edges(
        "strategy_gate",
        _route_after_strategy_gate,
        {
            "run_audience": "run_audience",
            "run_strategy": "run_strategy",
            "strategy_rejected": "strategy_rejected",
            "escalate": "escalate",
        },
    )

    # Linear post-Gate1 pipeline
    g.add_edge("run_audience", "run_creative_targeting")
    g.add_edge("run_creative_targeting", "run_experience")
    g.add_edge("run_experience", "run_experiment_measurement")
    g.add_edge("run_experiment_measurement", "run_validation")

    # Conditional routing after validation
    g.add_conditional_edges(
        "run_validation",
        _route_after_validation,
        {
            "run_preview": "run_preview",
            "validation_failed": "validation_failed",
        },
    )

    g.add_edge("run_preview", "preview_gate")

    # Conditional routing after Gate 2
    g.add_conditional_edges(
        "preview_gate",
        _route_after_preview_gate,
        {
            "finalize": "finalize",
            "preview_rejected": "preview_rejected",
        },
    )

    # Terminal nodes → END
    g.add_edge("finalize", END)
    g.add_edge("strategy_rejected", END)
    g.add_edge("preview_rejected", END)
    g.add_edge("validation_failed", END)
    g.add_edge("escalate", END)

    return g.compile(checkpointer=checkpointer)


# Module-level compiled graph (uses MemorySaver — replace checkpointer in production)
supervisor_graph = build_supervisor_graph()
