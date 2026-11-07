"""Shared advertising-compliance rules (used by /cities, /generate-ad and /compliance).

Rules live in data/ro_ad_rules.json. If that file is missing, empty or invalid the
built-in defaults below are used, so the API never crashes on a bad rules file.

check_copy() returns {"status": "passed" | "fixed" | "blocked", "note": str}.
When status is "fixed" the dict also carries the rewritten "headline" and "body".
Copy the user edited by hand is never rewritten silently: it is blocked instead.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

RULES_PATH = Path(__file__).resolve().parents[2] / "data" / "ro_ad_rules.json"

# Used when data/ro_ad_rules.json cannot be read: the original hardcoded list.
DEFAULT_RULES: dict[str, Any] = {
    "forbidden": [
        {
            "id": "unprovable-superlative",
            "message": "is a claim we cannot prove",
            "patterns": [
                {"match": w}
                for w in ("cel mai bun", "cea mai buna", "cei mai buni", "perfect", "garantat", "numarul 1")
            ],
        }
    ],
    "required_disclaimers": [],
}

PASSED = {"status": "passed", "note": "No brand or advertising rule issues found."}

_rules_cache: dict[str, Any] = {"mtime": None, "rules": DEFAULT_RULES, "source": "built-in defaults"}


def _fold_with_map(text: str) -> tuple[str, list[int]]:
    """Casefold + strip accents, returning the folded text and, for every folded
    character, the index of the original character it came from."""
    out: list[str] = []
    index: list[int] = []
    for i, ch in enumerate(text):
        folded = "".join(c for c in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(c)).casefold()
        for c in folded:
            out.append(c)
            index.append(i)
    return "".join(out), index


def _fold(text: str) -> str:
    return re.sub(r"\s+", " ", _fold_with_map(text)[0]).strip()


def _pattern_re(match: str) -> re.Pattern[str]:
    return re.compile(r"(?<!\w)" + re.escape(_fold(match)) + r"(?!\w)")


def load_rules() -> dict[str, Any]:
    """Load the rules file, reloading when it changes on disk."""
    try:
        mtime = RULES_PATH.stat().st_mtime
    except OSError:
        return _rules_cache["rules"]
    if _rules_cache["mtime"] == mtime:
        return _rules_cache["rules"]
    try:
        rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))
        if not isinstance(rules.get("forbidden"), list):
            raise ValueError("missing 'forbidden' list")
        _rules_cache.update(mtime=mtime, rules=rules, source=str(RULES_PATH.name))
    except (ValueError, OSError) as error:  # includes json.JSONDecodeError and an empty file
        log.warning("Could not use %s (%s); using built-in rules", RULES_PATH, error)
        _rules_cache.update(mtime=mtime, rules=DEFAULT_RULES, source="built-in defaults")
    return _rules_cache["rules"]


def rules_info() -> dict[str, Any]:
    rules = load_rules()
    return {
        "source": _rules_cache["source"],
        "forbidden_rules": len(rules.get("forbidden", [])),
        "disclaimer_rules": len(rules.get("required_disclaimers", [])),
    }


def _hits(text: str, rules: dict[str, Any]) -> list[dict[str, Any]]:
    """Every forbidden pattern found in text: {rule, message, match, replace}."""
    folded = _fold(text)
    found = []
    for rule in rules.get("forbidden", []):
        for pattern in rule.get("patterns", []):
            if _pattern_re(pattern["match"]).search(folded):
                found.append(
                    {
                        "rule": rule.get("id", ""),
                        "message": rule.get("message", "is a claim we cannot prove"),
                        "match": pattern["match"],
                        "replace": pattern.get("replace"),
                    }
                )
    return found


def _rewrite(text: str, hits: list[dict[str, Any]]) -> str:
    """Apply the replacements to the original text, keeping its accents and case elsewhere."""
    for hit in hits:
        if hit["replace"] is None:
            continue
        folded, index = _fold_with_map(text)
        for m in reversed(list(_pattern_re(hit["match"]).finditer(folded))):
            start, end = index[m.start()], index[m.end() - 1] + 1
            replacement = hit["replace"]
            if text[start : start + 1].isupper():
                replacement = replacement[:1].upper() + replacement[1:]
            text = text[:start] + replacement + text[end:]
    return text


def _missing_disclaimer(text: str, category: str | None, rules: dict[str, Any]) -> dict[str, Any] | None:
    if not category:
        return None
    folded = _fold(text)
    for rule in rules.get("required_disclaimers", []):
        if category not in rule.get("categories", []):
            continue
        triggered = any(_pattern_re(t).search(folded) or _fold(t) in folded for t in rule.get("triggers", []))
        if triggered and not any(_fold(d) in folded for d in rule.get("disclaimer_contains", [])):
            return rule
    return None


def _blocked(hit: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "blocked",
        "note": f"Held back: {hit['match']!r} {hit['message']}. Edit the copy to release it.",
    }


def check_copy(headline: str, body: str, *, edited: bool = False, category: str | None = None) -> dict[str, Any]:
    rules = load_rules()

    hits = _hits(f"{headline} {body}", rules)
    unfixable = next((h for h in hits if h["replace"] is None), None)
    if unfixable:
        return _blocked(unfixable)

    if hits:
        if edited:  # never rewrite what the person typed
            return _blocked(hits[0])
        new_headline, new_body = _rewrite(headline, hits), _rewrite(body, hits)
        remaining = _hits(f"{new_headline} {new_body}", rules)
        if remaining:
            return _blocked(remaining[0])
        changes = ", ".join(f"{h['match']!r} -> {h['replace']!r}" for h in hits)
        return {
            "status": "fixed",
            "note": f"Softened the copy automatically: {changes}.",
            "headline": new_headline,
            "body": new_body,
        }

    missing = _missing_disclaimer(f"{headline} {body}", category, rules)
    if missing:
        return {"status": "blocked", "note": f"Held back: {missing.get('message', 'a required notice is missing')}"}

    if edited:
        return {"status": "passed", "note": "Your edited copy passed the brand and advertising rules."}
    return dict(PASSED)


# Kept for callers that only need the first violation.
def find_violation(*texts: str) -> str | None:
    hits = _hits(" ".join(texts), load_rules())
    return hits[0]["match"] if hits else None
