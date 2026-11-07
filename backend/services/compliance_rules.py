"""Shared advertising-compliance rules (used by /cities, /generate-ad and /compliance)."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Claims we cannot prove. Matched on accent-stripped, lower-cased text.
SUPERLATIVES = ["cel mai bun", "cea mai buna", "cei mai buni", "perfect", "garantat", "numarul 1"]

PASSED = {"status": "passed", "note": "No brand or advertising rule issues found."}


def _fold(text: str) -> str:
    stripped = "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )
    return re.sub(r"\s+", " ", stripped.casefold()).strip()


def find_violation(*texts: str) -> str | None:
    haystack = _fold(" ".join(texts))
    return next((w for w in SUPERLATIVES if w in haystack), None)


def check_copy(headline: str, body: str, *, edited: bool = False) -> dict[str, Any]:
    hit = find_violation(headline, body)
    if hit:
        return {
            "status": "blocked",
            "note": f"Held back: {hit!r} is a claim we cannot prove. Edit the copy to release it.",
        }
    if edited:
        return {"status": "passed", "note": "Your edited copy passed the brand and advertising rules."}
    return dict(PASSED)
