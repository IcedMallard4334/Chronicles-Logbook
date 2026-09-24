"""Structured search over custom fields (US-3.11).

The plain keyword search in app.routers.entries treats every field the same
way: stringify it, lower-case it, check for a substring. That is enough for
"find the entry that mentions Nairobi", but not for "hours greater than 3" or
"status is Closed AND priority is High". This module adds conditions that
understand a field's *type* — a number can be compared, a date can be
bracketed, a dropdown can be matched against its options — and a way to
combine several of them with AND or OR.

A condition names a field by id and is evaluated against one entry at a time.
Which operators make sense depends on the field's type, so operators are
validated against the project's *current* schema (the field list a caller
actually sees and is allowed to query) before search runs, but each entry's
value is read against *that entry's own* ``schema_snapshot`` — the shape its
project had when it was written. This mirrors how app.routers.statistics
already reads historical values: a field that did not exist yet, or existed
under a different type, is not something an old entry can honestly answer, so
it is treated as "not recorded" (never matched, never an error) rather than
guessed at.
"""

import json
from datetime import date
from typing import Any

from app.schemas import FieldCondition

# ── Operators ─────────────────────────────────────────────────────────────

OPERATORS_BY_TYPE: dict[str, set[str]] = {
    "text": {"contains", "equals"},
    "number": {"equals", "gt", "gte", "lt", "lte", "between"},
    "computed": {"equals", "gt", "gte", "lt", "lte", "between"},
    "date": {"on", "before", "after", "between"},
    "dropdown": {"equals", "in"},
    "tags": {"has", "has_any", "has_all"},
    "checklist": {"contains", "complete"},
    "link": {"is_set", "is_empty", "equals"},
    "project_reference": {"is_set", "is_empty", "equals"},
}

MAX_CONDITIONS = 10


class SearchQueryError(ValueError):
    """A structured search request could not be understood.

    Raised with a message written for the person who typed the search, not
    for a log file — the router turns this straight into a 422 detail.
    """


def parse_conditions(raw: str | None) -> list[FieldCondition]:
    """Parse the ``conditions`` query parameter into validated conditions.

    ``raw`` is a JSON-encoded array, since a GET request has no body to carry
    a list of small objects in. Anything that is not that — malformed JSON,
    the wrong shape, an unknown key — is rejected here with a plain-English
    reason rather than surfacing a raw parser error.
    """
    if raw is None or not raw.strip():
        return []

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise SearchQueryError(
            "The search conditions could not be read — they should be a "
            f"list of {{field_id, operator, value}} objects, encoded as JSON ({error.msg})."
        ) from error

    if not isinstance(payload, list):
        raise SearchQueryError("Search conditions must be a list of conditions.")

    if len(payload) > MAX_CONDITIONS:
        raise SearchQueryError(f"A search can combine at most {MAX_CONDITIONS} conditions.")

    conditions: list[FieldCondition] = []
    for index, item in enumerate(payload, start=1):
        try:
            conditions.append(FieldCondition.model_validate(item))
        except Exception as error:  # noqa: BLE001 - re-raised as a plain message below
            raise SearchQueryError(
                f"Condition {index} isn't valid: each one needs a field_id and an "
                "operator, and nothing else."
            ) from error

    return conditions


def validate_conditions_against_schema(
    conditions: list[FieldCondition], entry_schema: list[dict[str, Any]]
) -> None:
    """Check every condition names a real field with an operator that fits it.

    Checked against the project's *current* schema: this is what decides
    which fields and operators a caller is allowed to ask for. Whether a
    given entry can actually answer the question is decided separately, per
    entry, in ``condition_matches``.
    """
    fields_by_id = {field["id"]: field for field in entry_schema}

    for condition in conditions:
        field = fields_by_id.get(condition.field_id)
        if field is None:
            raise SearchQueryError(
                f"'{condition.field_id}' is not a field on this project's current schema."
            )

        field_type = field.get("type")
        allowed = OPERATORS_BY_TYPE.get(field_type, set())
        if condition.operator not in allowed:
            label = field.get("name", condition.field_id)
            raise SearchQueryError(
                f"'{condition.operator}' can't be used on '{label}' "
                f"({field_type} fields support: {', '.join(sorted(allowed)) or 'nothing'})."
            )

        if condition.operator == "between" and (condition.value is None or condition.value2 is None):
            raise SearchQueryError(
                f"The 'between' operator on '{field.get('name', condition.field_id)}' "
                "needs both a lower and an upper value."
            )


def _field_type_for_entry(
    schema_snapshot: list[dict[str, Any]], field_id: str
) -> str | None:
    for field in schema_snapshot or []:
        if field.get("id") == field_id:
            return field.get("type")
    return None


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _as_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _match_text(value: Any, operator: str, target: Any) -> bool:
    if not isinstance(value, str) or not isinstance(target, str):
        return False
    if operator == "contains":
        return target.strip().lower() in value.lower()
    return value.strip().lower() == target.strip().lower()


def _match_number(value: Any, operator: str, condition: FieldCondition) -> bool:
    number = _as_number(value)
    if number is None:
        return False
    if operator == "between":
        low, high = _as_number(condition.value), _as_number(condition.value2)
        if low is None or high is None:
            return False
        return min(low, high) <= number <= max(low, high)
    target = _as_number(condition.value)
    if target is None:
        return False
    return {
        "equals": number == target,
        "gt": number > target,
        "gte": number >= target,
        "lt": number < target,
        "lte": number <= target,
    }[operator]


def _match_date(value: Any, operator: str, condition: FieldCondition) -> bool:
    entry_date = _as_date(value)
    if entry_date is None:
        return False
    if operator == "between":
        low, high = _as_date(condition.value), _as_date(condition.value2)
        if low is None or high is None:
            return False
        return min(low, high) <= entry_date <= max(low, high)
    target = _as_date(condition.value)
    if target is None:
        return False
    return {
        "on": entry_date == target,
        "before": entry_date < target,
        "after": entry_date > target,
    }[operator]


def _match_dropdown(value: Any, operator: str, condition: FieldCondition) -> bool:
    if not isinstance(value, str):
        return False
    if operator == "equals":
        return isinstance(condition.value, str) and value.strip().lower() == condition.value.strip().lower()
    options = condition.value if isinstance(condition.value, list) else []
    wanted = {str(option).strip().lower() for option in options}
    return value.strip().lower() in wanted


def _match_tags(value: Any, operator: str, condition: FieldCondition) -> bool:
    if not isinstance(value, list):
        return False
    entry_tags = {str(tag).strip().lower() for tag in value if isinstance(tag, str)}
    if operator == "has":
        return isinstance(condition.value, str) and condition.value.strip().lower() in entry_tags
    wanted = condition.value if isinstance(condition.value, list) else []
    wanted_tags = {str(tag).strip().lower() for tag in wanted}
    if not wanted_tags:
        return False
    if operator == "has_any":
        return bool(entry_tags & wanted_tags)
    return wanted_tags.issubset(entry_tags)  # has_all


def _match_checklist(value: Any, operator: str, condition: FieldCondition) -> bool:
    if not isinstance(value, list):
        return False
    if operator == "contains":
        needle = condition.value.strip().lower() if isinstance(condition.value, str) else ""
        if not needle:
            return False
        return any(
            needle in str(item.get("text", "")).lower()
            for item in value
            if isinstance(item, dict)
        )
    # complete: True asks "is every item ticked off" (an empty checklist has
    # nothing to be complete, so it does not qualify); False asks "is there
    # still something outstanding here".
    if not value:
        return False
    all_done = all(bool(item.get("completed")) for item in value if isinstance(item, dict))
    return all_done if condition.value else not all_done


def _match_reference(value: Any, operator: str, condition: FieldCondition) -> bool:
    has_value = isinstance(value, str) and value.strip() != ""
    if operator == "is_set":
        return has_value
    if operator == "is_empty":
        return not has_value
    return has_value and isinstance(condition.value, str) and value.strip().lower() == condition.value.strip().lower()


_MATCHERS = {
    "text": _match_text,
    "dropdown": _match_dropdown,
    "tags": _match_tags,
    "checklist": _match_checklist,
    "link": _match_reference,
    "project_reference": _match_reference,
}


def condition_matches(
    entry_data: dict[str, Any],
    schema_snapshot: list[dict[str, Any]],
    condition: FieldCondition,
) -> bool:
    """Whether one entry satisfies one condition.

    Reads the field's type from the entry's own schema snapshot rather than
    the project's current schema: an entry from before a field existed, or
    from when it held a different type, simply cannot answer the question,
    and reports "no match" rather than guessing or raising.
    """
    field_type = _field_type_for_entry(schema_snapshot, condition.field_id)
    if field_type is None:
        return False

    if condition.operator not in OPERATORS_BY_TYPE.get(field_type, set()):
        return False

    value = entry_data.get(condition.field_id)

    if field_type in ("number", "computed"):
        return _match_number(value, condition.operator, condition)
    if field_type == "date":
        return _match_date(value, condition.operator, condition)
    if field_type == "text":
        return _match_text(value, condition.operator, condition.value)

    matcher = _MATCHERS.get(field_type)
    return matcher(value, condition.operator, condition) if matcher else False


def conditions_match(
    entry_data: dict[str, Any],
    schema_snapshot: list[dict[str, Any]],
    conditions: list[FieldCondition],
    match: str,
) -> tuple[bool, int]:
    """Whether an entry survives the whole condition list, and how many it hit.

    An empty condition list is not a filter at all — every entry passes it —
    which matters because ``any(())`` is ``False`` in Python and would
    otherwise silently exclude everything the moment no conditions are given.
    The satisfied count is returned alongside the pass/fail so relevance
    ranking (more matched OR-conditions is more relevant) does not have to
    recompute it.
    """
    if not conditions:
        return True, 0

    satisfied = sum(
        1
        for condition in conditions
        if condition_matches(entry_data, schema_snapshot, condition)
    )

    passed = satisfied == len(conditions) if match == "all" else satisfied > 0
    return passed, satisfied


def keyword_matches(project_name: str, entry_data: dict[str, Any], query: str) -> tuple[bool, int]:
    """Whether the free-text query appears anywhere in the entry, and how often.

    Mirrors the previous plain-keyword search (project name plus every field
    value, stringified and lower-cased) but also counts occurrences, which
    feeds the relevance ranking below.
    """
    if not query:
        return True, 0

    haystacks = [project_name] + [str(value) for value in entry_data.values()]
    text = " ".join(haystacks).lower()
    count = text.count(query)
    return count > 0, count


def relevance_key(condition_hits: int, keyword_hits: int, created_at) -> tuple[int, int, Any]:
    """Sort key for relevance ranking, most relevant first when sorted descending.

    Lexicographic rather than a blended score: an entry that satisfies more
    of the OR'd conditions always outranks one that merely repeats the
    keyword more often, which a simple sum could get backwards.
    """
    return (condition_hits, keyword_hits, created_at)
