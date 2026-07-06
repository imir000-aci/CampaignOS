"""Stub LLM client for offline CI/CD — returns canned responses without API calls.

Activated by setting AGENT_LLM_STUB=true (or AGENT_LLM_STUB=1).
The stub returns responses keyed by (agent_name, input_hash) from the
golden fixture registry, falling back to a generic valid response.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .client import LlmResponse, LlmUsage, Message, ToolDefinition

# Location of golden-pair fixtures on disk
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent.parent / "tests" / "fixtures"


def _hash_messages(messages: list[Message]) -> str:
    payload = json.dumps([m.model_dump() for m in messages], sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


class StubLlmClient:
    """Drop-in replacement for LlmClient that never calls the Anthropic API.

    Usage: the factory function `get_llm_client()` in factory.py returns this
    when AGENT_LLM_STUB=true, so agents require no code changes to run in stub mode.
    """

    def __init__(self, model: str = "claude-haiku-4-5-20251001", agent_name: str = "unknown") -> None:
        self.model = model
        self.agent_name = agent_name

    def complete(
        self,
        messages: list[Message],
        system: str | None = None,
        tools: list[ToolDefinition] | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> LlmResponse:
        msg_hash = _hash_messages(messages)

        # Try agent-specific fixture first
        fixture_path = FIXTURES_DIR / f"{self.agent_name}_{msg_hash}.json"
        if fixture_path.exists():
            data = json.loads(fixture_path.read_text())
            return LlmResponse(
                content=data.get("content", ""),
                tool_calls=data.get("tool_calls", []),
                usage=LlmUsage(input_tokens=100, output_tokens=200),
                stop_reason="end_turn",
            )

        # Fallback: generic valid stub response
        return self._generic_stub(tools)

    def _generic_stub(self, tools: list[ToolDefinition] | None) -> LlmResponse:
        """Return a minimal valid response that satisfies schema validation."""
        if tools:
            # Return a tool call for the first tool with minimal valid data
            first_tool = tools[0]
            return LlmResponse(
                content="",
                tool_calls=[
                    {
                        "name": first_tool.name,
                        "input": self._stub_tool_input(first_tool),
                        "id": "stub_call_001",
                    }
                ],
                usage=LlmUsage(input_tokens=50, output_tokens=50),
                stop_reason="tool_use",
            )
        return LlmResponse(
            content='{"stub": true, "message": "Stub LLM response — AGENT_LLM_STUB=true"}',
            tool_calls=[],
            usage=LlmUsage(input_tokens=50, output_tokens=50),
            stop_reason="end_turn",
        )

    def _stub_tool_input(self, tool: ToolDefinition) -> dict[str, Any]:
        """Generate minimal stub input matching tool's schema required properties."""
        schema = tool.input_schema
        properties = schema.get("properties", {})
        required = set(schema.get("required", []))
        result: dict[str, Any] = {}
        for key, prop in properties.items():
            if key not in required:
                continue
            prop_type = prop.get("type", "string")
            if prop_type == "string":
                result[key] = f"stub_{key}"
            elif prop_type == "number":
                result[key] = 0.0
            elif prop_type == "integer":
                result[key] = 0
            elif prop_type == "boolean":
                result[key] = True
            elif prop_type == "array":
                result[key] = []
            elif prop_type == "object":
                result[key] = {}
        return result


def get_llm_client(model: str = "claude-haiku-4-5-20251001", agent_name: str = "unknown") -> Any:
    """Factory — returns StubLlmClient when AGENT_LLM_STUB is truthy, else LlmClient."""
    stub_env = os.environ.get("AGENT_LLM_STUB", "").lower()
    if stub_env in ("1", "true", "yes"):
        return StubLlmClient(model=model, agent_name=agent_name)

    from .client import LlmClient
    return LlmClient(model=model)
