"""Cost guard — enforces per-run token budgets to prevent runaway LLM spending."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class BudgetExhaustedError(Exception):
    """Raised when cost guard blocks an LLM call that would exceed the budget."""

    def __init__(self, tokens_spent: int, budget: int, estimated_tokens: int) -> None:
        super().__init__(
            f"Token budget exhausted: {tokens_spent}/{budget} spent, "
            f"estimated {estimated_tokens} needed for next call"
        )
        self.tokens_spent = tokens_spent
        self.budget = budget
        self.estimated_tokens = estimated_tokens


def _estimate_tokens(text: str) -> int:
    """Fast approximation: ~4 characters per token (tiktoken not required)."""
    return max(1, len(text) // 4)


class CostGuard:
    """Tracks token usage and blocks calls that would exceed the per-run budget.

    Each agent creates one CostGuard at run start. The guard is passed to
    ReflectCritiqueReviseLoop which calls check_budget() before each LLM call.
    """

    def __init__(self, budget_tokens: int) -> None:
        self.budget_tokens = budget_tokens
        self._spent: int = 0
        self.truncated: bool = False

    @property
    def tokens_spent(self) -> int:
        return self._spent

    @property
    def tokens_remaining(self) -> int:
        return max(0, self.budget_tokens - self._spent)

    def record_usage(self, input_tokens: int, output_tokens: int) -> None:
        self._spent += input_tokens + output_tokens

    def check_budget(self, prompt: str, max_tokens: int = 4096) -> None:
        """Check if calling the LLM would exceed the budget.

        Args:
            prompt: The prompt text being sent (used for estimation).
            max_tokens: Maximum output tokens requested.

        Raises:
            BudgetExhaustedError: If the estimated call would exceed the budget.
        """
        estimated_input = _estimate_tokens(prompt)
        estimated_total = estimated_input + max_tokens
        if self._spent + estimated_total > self.budget_tokens:
            self.truncated = True
            logger.warning(
                "Cost guard: budget exhausted (spent=%d, budget=%d, estimated=%d)",
                self._spent,
                self.budget_tokens,
                estimated_total,
            )
            raise BudgetExhaustedError(
                tokens_spent=self._spent,
                budget=self.budget_tokens,
                estimated_tokens=estimated_total,
            )

    def soft_check(self, prompt: str, max_tokens: int = 4096) -> bool:
        """Returns False if the call would exceed budget (non-raising version)."""
        estimated = _estimate_tokens(prompt) + max_tokens
        return self._spent + estimated <= self.budget_tokens
