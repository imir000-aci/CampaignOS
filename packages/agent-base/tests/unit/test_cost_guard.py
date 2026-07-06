"""Unit tests for cost guard."""
import pytest

from agent_base.loops.cost_guard import BudgetExhaustedError, CostGuard


class TestCostGuard:
    def test_initial_state(self) -> None:
        guard = CostGuard(budget_tokens=10_000)
        assert guard.tokens_spent == 0
        assert guard.tokens_remaining == 10_000
        assert not guard.truncated

    def test_record_usage(self) -> None:
        guard = CostGuard(budget_tokens=10_000)
        guard.record_usage(input_tokens=500, output_tokens=200)
        assert guard.tokens_spent == 700
        assert guard.tokens_remaining == 9_300

    def test_check_budget_passes_within_budget(self) -> None:
        guard = CostGuard(budget_tokens=10_000)
        guard.check_budget("short prompt", max_tokens=100)  # should not raise

    def test_check_budget_raises_when_exhausted(self) -> None:
        guard = CostGuard(budget_tokens=500)
        guard.record_usage(input_tokens=450, output_tokens=0)
        with pytest.raises(BudgetExhaustedError) as exc_info:
            guard.check_budget("a" * 100, max_tokens=512)
        assert exc_info.value.tokens_spent == 450
        assert guard.truncated

    def test_soft_check_returns_false_when_over_budget(self) -> None:
        guard = CostGuard(budget_tokens=100)
        guard.record_usage(input_tokens=90, output_tokens=0)
        assert guard.soft_check("a" * 100, max_tokens=512) is False

    def test_soft_check_returns_true_within_budget(self) -> None:
        guard = CostGuard(budget_tokens=10_000)
        assert guard.soft_check("short", max_tokens=100) is True
