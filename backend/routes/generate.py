"""AI insight endpoint."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ml.agent.decide import ask_agent

router = APIRouter()
ROOT = Path(__file__).resolve().parents[2]


class InsightRequest(BaseModel):
    question: str = Field(min_length=10)
    report: str | None = None


@router.post("/generate")
def generate_insight(request: InsightRequest) -> dict[str, Any]:
    try:
        insight = ask_agent(request.question, report_path=request.report)
        payload = json.loads(insight)
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    output_path = ROOT / "data" / "agent_insight.json"
    with output_path.open("w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, ensure_ascii=False, indent=2)
    return payload