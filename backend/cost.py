"""Tiny cost tracker shared by features (for the cost-vs-value bonus slide).

Prices are estimates in USD; adjust them to your real plans.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

PRICES = {
    # Claude Opus 5.5, per token
    "claude_input_token": 4.00 / 1_000_000,
    "claude_output_token": 20.00 / 1_000_000,
    # ElevenLabs, per character of voiceover (approx. Creator-plan rate)
    "elevenlabs_char": 0.18 / 1000,
    # Adobe Firefly generative expand, per image (estimate)
    "firefly_image": 0.04,
    # Render compute per video (cloud worker estimate)
    "render_video": 0.01,
}

# What the same deliverable costs without AI (freelance UGC creator, per video)
MANUAL_BASELINE_USD = 150.0


class CostLine(BaseModel):
    item: str
    quantity: float
    usd: float


class CostReport(BaseModel):
    lines: list[CostLine] = Field(default_factory=list)

    @property
    def total(self) -> float:
        return round(sum(line.usd for line in self.lines), 4)

    def add(self, item: str, quantity: float, unit_price_key: str) -> None:
        self.lines.append(
            CostLine(item=item, quantity=quantity, usd=round(quantity * PRICES[unit_price_key], 5))
        )

    def summary(self) -> dict:
        return {
            "lines": [line.model_dump() for line in self.lines],
            "total_usd": self.total,
            "manual_baseline_usd": MANUAL_BASELINE_USD,
        }
