"""Shared fixtures for supervisor-agent tests.

Always runs with AGENT_LLM_STUB=true so no Anthropic API key is required.
"""
from __future__ import annotations

import os

# Set before any agent imports
os.environ["AGENT_LLM_STUB"] = "true"

import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session", autouse=True)
def enforce_stub_mode():
    """Guarantee stub mode is active for all supervisor-agent tests."""
    assert os.environ.get("AGENT_LLM_STUB", "").lower() in ("1", "true", "yes"), (
        "AGENT_LLM_STUB must be set to 'true' for tests"
    )
