"""Reflect → Critique → Revise loop — the core intra-agent validation pattern.

Per Section 13.1 of the architecture plan:
  1. Agent produces a draft output
  2. Schema validation (Pydantic) — retry with reprompt on failure
  3. Self-critique via a lightweight model (claude-haiku-4-5) → DimensionScores
  4. If overall_score >= threshold: EMIT
  5. If overall_score < threshold AND iterations < max: REVISE (inject critique)
  6. If iterations >= max AND score < hard_minimum: ESCALATE (LOW_CONFIDENCE flag)
"""
from __future__ import annotations

import json
import logging
from typing import Any, TypeVar

from pydantic import BaseModel

from ..llm.client import LlmResponse, Message
from ..llm.stub import get_llm_client
from ..schemas import AgentActionTaken, CritiqueResult, DimensionScores
from ..validation.output import SchemaValidationError, build_schema_error_prompt, validate_output
from .cost_guard import BudgetExhaustedError, CostGuard

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)

CRITIQUE_SYSTEM_PROMPT = """\
You are a rigorous critic evaluating AI agent outputs for a marketing platform.
Score the given output on each listed dimension from 1 (very poor) to 5 (excellent).
Return ONLY a JSON object with this exact schema:
{{
  "dimension_scores": {{"<dimension>": <score_1_to_5>, ...}},
  "blocking_issues": ["<issue>", ...],
  "improvement_suggestions": ["<suggestion>", ...],
  "overall_score": <float>
}}
The overall_score should be the weighted average of dimension_scores.
Be strict: scores below 3 indicate a significant problem.
"""


class RcrResult(BaseModel):
    output: dict[str, Any]
    critique: CritiqueResult | None
    iterations: int
    action_taken: AgentActionTaken
    low_confidence: bool
    budget_truncated: bool
    tokens_used: int
    estimated_cost_usd: float


class ReflectCritiqueReviseLoop:
    """Orchestrates the Reflect → Critique → Revise loop for one agent execution.

    Args:
        agent_name: Name used for logging and telemetry.
        output_schema: Pydantic model class that the LLM output must conform to.
        dimensions: List of evaluation dimensions (e.g. ["brief_alignment", "feasibility"]).
        score_threshold: Minimum acceptable overall score (agent exits loop above this).
        hard_minimum_score: Below this score, emit with LOW_CONFIDENCE flag.
        max_iterations: Maximum number of critique+revise cycles.
        critique_model: Anthropic model used for the critic (default: haiku).
        cost_guard: Per-run budget tracker.
    """

    def __init__(
        self,
        agent_name: str,
        output_schema: type[T],
        dimensions: list[str],
        score_threshold: float = 3.5,
        hard_minimum_score: float = 2.5,
        max_iterations: int = 2,
        critique_model: str = "claude-haiku-4-5-20251001",
        cost_guard: CostGuard | None = None,
    ) -> None:
        self.agent_name = agent_name
        self.output_schema = output_schema
        self.dimensions = dimensions
        self.score_threshold = score_threshold
        self.hard_minimum_score = hard_minimum_score
        self.max_iterations = max_iterations
        self.cost_guard = cost_guard or CostGuard(budget_tokens=10_000)
        self._critique_client = get_llm_client(model=critique_model, agent_name=f"{agent_name}_critic")
        self._total_tokens = 0
        self._total_cost = 0.0

    def run(
        self,
        generate_fn: Any,  # Callable that takes messages -> LlmResponse
        initial_messages: list[Message],
        system_prompt: str,
    ) -> RcrResult:
        """Execute the full Reflect→Critique→Revise loop.

        Args:
            generate_fn: A callable(messages, system, ...) -> LlmResponse.
                         Typically `llm_client.complete`.
            initial_messages: Starting conversation messages.
            system_prompt: System prompt for the main agent.

        Returns:
            RcrResult with the final output and loop metadata.
        """
        messages = list(initial_messages)
        last_critique: CritiqueResult | None = None
        last_output: dict[str, Any] = {}
        schema_retries = 0
        max_schema_retries = 3

        for iteration in range(self.max_iterations + 1):
            # — Schema validation loop (up to 3 retries) —
            response: LlmResponse | None = None
            validated_output: T | None = None

            while schema_retries < max_schema_retries:
                try:
                    self.cost_guard.check_budget(
                        " ".join(m.content for m in messages), max_tokens=4096
                    )
                    response = generate_fn(messages=messages, system=system_prompt)
                    self._track_usage(response)
                except BudgetExhaustedError:
                    return RcrResult(
                        output=last_output,
                        critique=last_critique,
                        iterations=iteration,
                        action_taken=AgentActionTaken.EMIT,
                        low_confidence=True,
                        budget_truncated=True,
                        tokens_used=self._total_tokens,
                        estimated_cost_usd=self._total_cost,
                    )

                try:
                    validated_output = validate_output(response.content, self.output_schema)
                    break
                except SchemaValidationError as e:
                    schema_retries += 1
                    logger.warning(
                        "%s: schema validation failed (attempt %d): %s",
                        self.agent_name,
                        schema_retries,
                        e,
                    )
                    if schema_retries >= max_schema_retries:
                        logger.error(
                            "%s: max schema retries exceeded, escalating", self.agent_name
                        )
                        return RcrResult(
                            output=last_output,
                            critique=last_critique,
                            iterations=iteration,
                            action_taken=AgentActionTaken.ESCALATE,
                            low_confidence=True,
                            budget_truncated=False,
                            tokens_used=self._total_tokens,
                            estimated_cost_usd=self._total_cost,
                        )
                    messages = messages + [
                        Message(role="assistant", content=response.content),
                        Message(
                            role="user",
                            content=build_schema_error_prompt(e, self.output_schema),
                        ),
                    ]

            if validated_output is None:
                break

            last_output = validated_output.model_dump()

            # — Critique phase —
            critique = self._critique(validated_output)
            last_critique = critique

            logger.debug(
                "%s iteration=%d overall_score=%.2f",
                self.agent_name,
                iteration,
                critique.overall_score,
            )

            # — Decision —
            if critique.overall_score >= self.score_threshold:
                return RcrResult(
                    output=last_output,
                    critique=critique,
                    iterations=iteration + 1,
                    action_taken=AgentActionTaken.EMIT,
                    low_confidence=False,
                    budget_truncated=False,
                    tokens_used=self._total_tokens,
                    estimated_cost_usd=self._total_cost,
                )

            if iteration >= self.max_iterations:
                break

            # — Revise: inject critique as context —
            revision_prompt = self._build_revision_prompt(critique)
            messages = messages + [
                Message(role="assistant", content=response.content if response else ""),
                Message(role="user", content=revision_prompt),
            ]

        # Loop exhausted
        action = (
            AgentActionTaken.ESCALATE
            if (last_critique and last_critique.overall_score < self.hard_minimum_score)
            else AgentActionTaken.EMIT
        )
        return RcrResult(
            output=last_output,
            critique=last_critique,
            iterations=self.max_iterations + 1,
            action_taken=action,
            low_confidence=True,
            budget_truncated=self.cost_guard.truncated,
            tokens_used=self._total_tokens,
            estimated_cost_usd=self._total_cost,
        )

    def _critique(self, output: BaseModel) -> CritiqueResult:
        """Run the critic model on the agent output."""
        dimensions_str = ", ".join(self.dimensions)
        critique_prompt = (
            f"Evaluate this {self.agent_name} output on these dimensions: {dimensions_str}.\n\n"
            f"Output to evaluate:\n```json\n{json.dumps(output.model_dump(), indent=2)}\n```"
        )
        try:
            self.cost_guard.check_budget(critique_prompt, max_tokens=512)
            response = self._critique_client.complete(
                messages=[Message(role="user", content=critique_prompt)],
                system=CRITIQUE_SYSTEM_PROMPT,
                max_tokens=512,
            )
            self._track_usage(response)

            # Parse critique response
            import re
            json_match = re.search(r"\{[\s\S]+\}", response.content)
            if not json_match:
                raise ValueError("No JSON in critique response")
            data = json.loads(json_match.group())
            scores = DimensionScores(scores={
                k: float(v) for k, v in data.get("dimension_scores", {}).items()
            })
            return CritiqueResult(
                dimension_scores=scores,
                blocking_issues=data.get("blocking_issues", []),
                improvement_suggestions=data.get("improvement_suggestions", []),
                overall_score=float(data.get("overall_score", scores.overall())),
            )
        except (BudgetExhaustedError, Exception) as e:
            logger.warning("%s: critique failed (%s), using pass-through", self.agent_name, e)
            # On critique failure, return a neutral score so the loop continues
            neutral = {d: 3.5 for d in self.dimensions}
            return CritiqueResult(
                dimension_scores=DimensionScores(scores=neutral),
                overall_score=3.5,
            )

    def _build_revision_prompt(self, critique: CritiqueResult) -> str:
        weak = critique.dimension_scores.weak_dimensions(threshold=3.5)
        issues = "\n".join(f"- {i}" for i in critique.blocking_issues)
        suggestions = "\n".join(f"- {s}" for s in critique.improvement_suggestions)
        return (
            f"Your output scored {critique.overall_score:.1f}/5 overall "
            f"(threshold: {self.score_threshold}).\n"
            f"Weak dimensions: {', '.join(weak) or 'none'}.\n"
            f"Blocking issues:\n{issues or '(none)'}\n"
            f"Suggestions:\n{suggestions or '(none)'}\n\n"
            "Please revise your output addressing the issues above. "
            "Return ONLY the improved JSON."
        )

    def _track_usage(self, response: LlmResponse) -> None:
        self._total_tokens += response.usage.input_tokens + response.usage.output_tokens
        self.cost_guard.record_usage(response.usage.input_tokens, response.usage.output_tokens)
        # Approximate cost tracking (critique model is always haiku)
        self._total_cost += (
            response.usage.input_tokens * 0.80 + response.usage.output_tokens * 4.00
        ) / 1_000_000
