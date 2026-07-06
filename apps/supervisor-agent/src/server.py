"""Entry point for the CampaignOS supervisor-agent service.

Runs on port 4000 (configurable via PORT env var).

Usage:
    python -m src.server
    uvicorn src.api:app --reload --port 4000
"""
from __future__ import annotations

import logging
import os

import uvicorn

logging.basicConfig(level=logging.INFO)


def main() -> None:
    uvicorn.run(
        "src.api:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 4000)),
        reload=os.environ.get("RELOAD", "false").lower() == "true",
        log_level="info",
    )


if __name__ == "__main__":
    main()
