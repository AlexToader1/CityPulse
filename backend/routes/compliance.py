"""Compliance check endpoint for ad copy."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.compliance_rules import check_copy

router = APIRouter()


class ComplianceRequest(BaseModel):
    city: str
    headline: str
    body: str
    draft: dict[str, Any] | None = None
    edited: bool = False


@router.post("/compliance")
def check_compliance(request: ComplianceRequest) -> dict[str, Any]:
    return check_copy(request.headline, request.body, edited=request.edited)
