"""Standalone agent runner — execute any agent from the CLI without Temporal/LangGraph.

Usage:
    # Run strategy agent with file-based input
    run-agent --agent strategy --input examples/brief_001.json

    # Run with stub LLM (no API key needed)
    AGENT_LLM_STUB=true run-agent --agent audience --input examples/audience_001.json

    # Output to file
    run-agent --agent targeting --input examples/targeting_001.json --output /tmp/result.json

This runner is the primary tool for:
  1. Building agents incrementally before Temporal integration
  2. Running golden-pair tests in CI (AGENT_LLM_STUB=true)
  3. Local development and iteration
"""
from __future__ import annotations

import argparse
import importlib
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

from .schemas import AgentConfig, AgentInput

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("agent_runner")

# Registry: agent_name -> importable module path
AGENT_REGISTRY: dict[str, str] = {
    "strategy": "agents.strategy.agent:StrategyAgent",
    "audience": "agents.audience.agent:AudienceAgent",
    "creative": "agents.creative.agent:CreativeAgent",
    "targeting": "agents.targeting.agent:TargetingAgent",
    "experience": "agents.experience.agent:ExperienceAgent",
    "experiment": "agents.experiment.agent:ExperimentAgent",
    "measurement": "agents.measurement.agent:MeasurementAgent",
    "validation": "agents.validation.agent:ValidationAgent",
    "preview": "agents.preview.agent:PreviewAgent",
}


def load_agent(agent_name: str) -> Any:
    """Dynamically import and instantiate an agent class."""
    if agent_name not in AGENT_REGISTRY:
        raise ValueError(
            f"Unknown agent: {agent_name!r}. "
            f"Available: {sorted(AGENT_REGISTRY)}"
        )
    module_path, class_name = AGENT_REGISTRY[agent_name].split(":")
    try:
        module = importlib.import_module(module_path)
        cls = getattr(module, class_name)
        return cls()
    except (ImportError, AttributeError) as e:
        raise ImportError(
            f"Could not load agent {agent_name!r} from {module_path}:{class_name}: {e}"
        ) from e


def load_fixture(path: str) -> dict[str, Any]:
    """Load a JSON fixture file."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Fixture not found: {path}")
    return json.loads(p.read_text())


def run_agent_standalone(
    agent_name: str,
    input_data: dict[str, Any] | None = None,
    input_file: str | None = None,
    stub_mode: bool | None = None,
    config_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Programmatic API for running an agent standalone.

    Args:
        agent_name: Name from AGENT_REGISTRY.
        input_data: Dict matching AgentInput schema (mutually exclusive with input_file).
        input_file: Path to JSON file with AgentInput data.
        stub_mode: Override AGENT_LLM_STUB env var. None = use env var.
        config_overrides: Partial AgentConfig dict to override defaults.

    Returns:
        AgentOutput.model_dump() dict.
    """
    if stub_mode is not None:
        os.environ["AGENT_LLM_STUB"] = "true" if stub_mode else "false"

    if input_file and input_data is None:
        input_data = load_fixture(input_file)

    if input_data is None:
        raise ValueError("Either input_data or input_file must be provided")

    config_dict = config_overrides or {}
    if stub_mode:
        config_dict["stub_mode"] = True

    config = AgentConfig(**config_dict)
    agent_input = AgentInput(
        campaign_id=input_data.get("campaign_id", "00000000-0000-0000-0000-000000000001"),
        upstream_outputs=input_data.get("upstream_outputs", {}),
        config=config,
    )

    agent = load_agent(agent_name)
    output = agent.run(agent_input)
    return output.model_dump()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a CampaignOS agent standalone (without Temporal/LangGraph)"
    )
    parser.add_argument(
        "--agent",
        required=True,
        choices=sorted(AGENT_REGISTRY),
        help="Agent to run",
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to JSON file containing AgentInput",
    )
    parser.add_argument(
        "--output",
        help="Path to write AgentOutput JSON (default: stdout)",
    )
    parser.add_argument(
        "--stub",
        action="store_true",
        help="Enable stub LLM mode (overrides AGENT_LLM_STUB env var)",
    )
    parser.add_argument(
        "--model",
        help="Override LLM model (must be an Anthropic model)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    config_overrides: dict[str, Any] = {}
    if args.model:
        config_overrides["model"] = args.model

    try:
        result = run_agent_standalone(
            agent_name=args.agent,
            input_file=args.input,
            stub_mode=args.stub or None,
            config_overrides=config_overrides,
        )

        output_json = json.dumps(result, indent=2, default=str)

        if args.output:
            Path(args.output).write_text(output_json)
            logger.info("Output written to %s", args.output)
        else:
            print(output_json)

    except FileNotFoundError as e:
        logger.error("Input file not found: %s", e)
        sys.exit(1)
    except ValueError as e:
        logger.error("Input error: %s", e)
        sys.exit(1)
    except Exception as e:
        logger.error("Agent run failed: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
