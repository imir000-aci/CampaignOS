"""Unit tests for the Reflect-Critique-Revise loop."""
import json
import os
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from agent_base.llm.client import LlmResponse, LlmUsage, Message
from agent_base.loops.cost_guard import CostGuard
from agent_base.loops.reflect_critique_revise import ReflectCritiqueReviseLoop
from agent_base.schemas import AgentActionTaken

os.environ["AGENT_LLM_STUB"] = "true"


class SampleOutput(BaseModel):
    headline: str
    body: str
    cta: str
    score: float = 4.0


VALID_JSON = json.dumps({
    "headline": "Save on Back-to-School Essentials",
    "body": "Stock up for the season with our exclusive deals",
    "cta": "Shop Now",
    "score": 4.5,
})

GOOD_CRITIQUE_JSON = json.dumps({
    "dimension_scores": {"clarity": 4.5, "cta_strength": 4.0},
    "blocking_issues": [],
    "improvement_suggestions": [],
    "overall_score": 4.25,
})

LOW_CRITIQUE_JSON = json.dumps({
    "dimension_scores": {"clarity": 2.0, "cta_strength": 2.0},
    "blocking_issues": ["CTA is too weak"],
    "improvement_suggestions": ["Add urgency"],
    "overall_score": 2.0,
})


def _make_response(content: str) -> LlmResponse:
    return LlmResponse(
        content=content,
        tool_calls=[],
        usage=LlmUsage(input_tokens=100, output_tokens=150),
        stop_reason="end_turn",
    )


class TestRcrLoop:
    def _make_loop(self, **kwargs: Any) -> ReflectCritiqueReviseLoop:
        return ReflectCritiqueReviseLoop(
            agent_name="test_agent",
            output_schema=SampleOutput,
            dimensions=["clarity", "cta_strength"],
            score_threshold=3.5,
            hard_minimum_score=2.5,
            max_iterations=2,
            cost_guard=CostGuard(budget_tokens=50_000),
            **kwargs,
        )

    def test_emit_on_high_score(self) -> None:
        loop = self._make_loop()
        generate_fn = MagicMock(return_value=_make_response(VALID_JSON))
        with patch.object(loop, "_critique", return_value=_parse_critique(GOOD_CRITIQUE_JSON)):
            result = loop.run(
                generate_fn=generate_fn,
                initial_messages=[Message(role="user", content="Generate copy")],
                system_prompt="You are a creative copywriter.",
            )
        assert result.action_taken == AgentActionTaken.EMIT
        assert not result.low_confidence
        assert result.output["headline"] == "Save on Back-to-School Essentials"

    def test_revise_on_low_score_then_emit(self) -> None:
        loop = self._make_loop()
        generate_fn = MagicMock(return_value=_make_response(VALID_JSON))
        critiques = [
            _parse_critique(LOW_CRITIQUE_JSON),   # first iteration: low
            _parse_critique(GOOD_CRITIQUE_JSON),  # second iteration: good
        ]
        with patch.object(loop, "_critique", side_effect=critiques):
            result = loop.run(
                generate_fn=generate_fn,
                initial_messages=[Message(role="user", content="Generate copy")],
                system_prompt="You are a creative copywriter.",
            )
        assert result.action_taken == AgentActionTaken.EMIT
        assert result.iterations == 2

    def test_escalate_when_score_below_hard_minimum(self) -> None:
        loop = self._make_loop(max_iterations=1)
        generate_fn = MagicMock(return_value=_make_response(VALID_JSON))
        very_low = _parse_critique(json.dumps({
            "dimension_scores": {"clarity": 1.0, "cta_strength": 1.0},
            "blocking_issues": ["Everything is wrong"],
            "improvement_suggestions": [],
            "overall_score": 1.0,
        }))
        with patch.object(loop, "_critique", return_value=very_low):
            result = loop.run(
                generate_fn=generate_fn,
                initial_messages=[Message(role="user", content="Generate copy")],
                system_prompt="You are a creative copywriter.",
            )
        assert result.action_taken == AgentActionTaken.ESCALATE
        assert result.low_confidence

    def test_budget_truncated_on_exhaustion(self) -> None:
        loop = self._make_loop(cost_guard=CostGuard(budget_tokens=1))
        generate_fn = MagicMock(return_value=_make_response(VALID_JSON))
        result = loop.run(
            generate_fn=generate_fn,
            initial_messages=[Message(role="user", content="Generate copy")],
            system_prompt="System",
        )
        assert result.budget_truncated


def _parse_critique(json_str: str) -> Any:
    from agent_base.schemas import CritiqueResult, DimensionScores
    data = json.loads(json_str)
    scores = DimensionScores(scores={k: float(v) for k, v in data["dimension_scores"].items()})
    return CritiqueResult(
        dimension_scores=scores,
        blocking_issues=data.get("blocking_issues", []),
        improvement_suggestions=data.get("improvement_suggestions", []),
        overall_score=float(data["overall_score"]),
    )
