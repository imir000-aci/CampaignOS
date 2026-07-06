"""Unit tests for stub LLM client."""
import os

import pytest

from agent_base.llm.stub import StubLlmClient, get_llm_client
from agent_base.llm.client import Message, ToolDefinition


class TestStubLlmClient:
    def test_returns_generic_text_response(self) -> None:
        client = StubLlmClient(agent_name="test")
        response = client.complete(
            messages=[Message(role="user", content="Hello")]
        )
        assert response.content
        assert response.usage.input_tokens == 50
        assert response.usage.output_tokens == 50
        assert response.stop_reason == "end_turn"

    def test_returns_tool_call_when_tools_provided(self) -> None:
        client = StubLlmClient(agent_name="test")
        tool = ToolDefinition(
            name="submit_output",
            description="Submit structured output",
            input_schema={
                "type": "object",
                "properties": {"result": {"type": "string"}},
                "required": ["result"],
            },
        )
        response = client.complete(
            messages=[Message(role="user", content="Hello")],
            tools=[tool],
        )
        assert len(response.tool_calls) == 1
        assert response.tool_calls[0]["name"] == "submit_output"
        assert "result" in response.tool_calls[0]["input"]

    def test_stop_reason_is_tool_use_when_tools_provided(self) -> None:
        client = StubLlmClient(agent_name="test")
        tool = ToolDefinition(
            name="my_tool",
            description="A tool",
            input_schema={"type": "object", "properties": {}, "required": []},
        )
        response = client.complete(
            messages=[Message(role="user", content="Go")],
            tools=[tool],
        )
        assert response.stop_reason == "tool_use"


class TestGetLlmClient:
    def test_returns_stub_when_env_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("AGENT_LLM_STUB", "true")
        client = get_llm_client()
        assert isinstance(client, StubLlmClient)

    def test_returns_stub_when_env_1(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("AGENT_LLM_STUB", "1")
        client = get_llm_client()
        assert isinstance(client, StubLlmClient)

    def test_returns_real_client_when_env_false(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("AGENT_LLM_STUB", "false")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-key")
        from agent_base.llm.client import LlmClient
        client = get_llm_client()
        assert isinstance(client, LlmClient)
