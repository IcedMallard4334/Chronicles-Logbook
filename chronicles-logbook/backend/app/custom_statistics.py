"""Figures the Statistics page lets a person define for themselves (US-3.8).

A saved statistic is a named formula over one project's entries — "Average of
Hours in Lab practicals", or anything arithmetic-shaped the person cares to
write. The formula is user input, so it is treated exactly as a computed
field's expression is (``app/computed.py``): parsed with ``ast`` against an
allowlist, never handed to ``eval``, and admitting nothing but numbers,
``+ - * /`` and a handful of aggregate calls — ``sum``, ``avg``, ``min``,
``max`` and ``count``. Where a computed field reads one entry, a statistic
reads a whole project: the aggregates fold every entry's values into the
numbers the arithmetic then combines.

Each of ``sum``/``avg``/``min``/``max`` takes exactly one field, written in
braces as ``sum({Hours})``; ``count()`` takes none and counts entries. Field
references resolve against the project's current schema, by id or by name
(case-insensitively, ids winning), and only number and computed fields may be
aggregated — arithmetic over a dropdown label or a date has no meaning.
Values are then read from each entry using *its own* schema snapshot, the
same rule ``read_field_statistics`` follows, so an entry recorded before a
field existed, or while it held a different type, is excluded rather than
misread.

Evaluating cannot fail the request. A formula that is wrong for the schema
raises ``StatisticError`` with a message meant to be shown as-is; a formula
that merely cannot produce a number yet — an average over no matching
entries, a division by zero — comes back as ``None`` with a note explaining
why, which is a state the logbook can legitimately be in.
"""

import ast
import difflib
import operator
import re
from dataclasses import dataclass
from math import isfinite
from typing import Any

# A field is referenced in braces, e.g. "avg({Hours})" — by its name, which
# is what a person knows, or by its id, which is how the formula is stored.
# The same shape as a computed field's references.
PLACEHOLDER = re.compile(r"\{\s*([^{}]+?)\s*\}")

# Kept in step with the SavedStatistic model's column, and with computed
# fields, whose limit this mirrors: long enough for anything a logbook needs,
# short enough that parsing stays trivial.
MAX_EXPRESSION_LENGTH = 500

AGGREGATE_NAMES = frozenset({"sum", "avg", "min", "max", "count"})

# The plain-English word the sentence builder and the saved cards use for
# each aggregate. "sum" reads as "Total" because that is what a person says.
AGGREGATE_WORDS = {
    "sum": "Total",
    "avg": "Average",
    "min": "Lowest",
    "max": "Highest",
}

_BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}

_UNARY_OPERATORS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Field types an aggregate may read, as with computed fields: a number, or
# something already derived from numbers.
NUMERIC_FIELD_TYPES = frozenset({"number", "computed"})


class StatisticError(ValueError):
    """A formula that cannot be used, with a message fit to show a user."""


@dataclass
class StatisticResult:
    """What evaluating a formula produced.

    ``value`` is ``None`` when the formula cannot produce a number yet — no
    matching entries, or a division by zero — with ``note`` saying why in a
    sentence. ``entries_used`` counts the entries the formula drew on, so a
    formula that quietly ignores the whole logbook is visible as such.
    """

    value: float | int | None
    entries_used: int = 0
    note: str | None = None


class _EvaluationState:
    """Mutable accumulator the nodes of one evaluation share."""

    def __init__(self) -> None:
        self.entries_used: set[int] = set()
        self.note: str | None = None


def _resolve_field(
    token: str, entry_schema: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """The schema field a reference token names, or ``None``.

    Ids match exactly; names match ignoring case and surrounding space —
    the same rule computed fields use, with ids winning over a name that
    happens to look like one.
    """
    by_id = {field["id"]: field for field in entry_schema}
    if token in by_id:
        return by_id[token]

    key = token.strip().lower()
    for field in entry_schema:
        if str(field.get("name", "")).strip().lower() == key:
            return field
    return None


def _raise_unknown_field(
    token: str, entry_schema: list[dict[str, Any]], project_name: str
) -> None:
    """Explain that a token names no field, suggesting the nearest name.

    The suggestion is what turns a typo into a one-click fix in the editor;
    it only appears when something close exists, so it never feels like a
    guess.
    """
    names = [
        str(field.get("name", "")) for field in entry_schema if field.get("name")
    ]
    suggestion = difflib.get_close_matches(token.strip(), names, n=1, cutoff=0.6)
    if suggestion:
        raise StatisticError(
            f"There's no field called '{token}' in {project_name}. "
            f"Did you mean '{suggestion[0]}'?"
        )
    raise StatisticError(f"There's no field called '{token}' in {project_name}.")


def _substitute(expression: str) -> tuple[str, dict[str, str]]:
    """Rewrite ``{Field}`` as a plain identifier Python can parse.

    Returns the rewritten source and a mapping from each generated
    identifier back to the field it stands for. Two occurrences of the same
    field get two identifiers pointing at the same field, which keeps the
    substitution a single pass.
    """
    names: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        name = f"_ref{len(names)}"
        names[name] = match.group(1)
        return name

    return PLACEHOLDER.sub(replace, expression), names


def _check_call(node: ast.Call, names: dict[str, str]) -> None:
    if not isinstance(node.func, ast.Name) or node.func.id not in AGGREGATE_NAMES:
        raise StatisticError(
            "The only functions a formula can use are "
            "sum(), avg(), min(), max() and count()."
        )

    if node.func.id == "count":
        if node.args or node.keywords:
            raise StatisticError(
                "count() counts the entries and takes nothing between its brackets."
            )
        return

    if len(node.args) != 1 or node.keywords:
        raise StatisticError(
            f"{node.func.id}() takes one field, like {node.func.id}({{Hours}})."
        )

    argument = node.args[0]
    if not isinstance(argument, ast.Name) or argument.id not in names:
        raise StatisticError(
            f"{node.func.id}() takes a single field, like {node.func.id}({{Hours}})."
        )


def _check_node(node: ast.AST, names: dict[str, str]) -> None:
    """Walk the tree, refusing anything that is not arithmetic and aggregates."""
    if isinstance(node, ast.BinOp):
        if type(node.op) not in _BINARY_OPERATORS:
            raise StatisticError("Only +, -, * and / can be used in a formula.")
        _check_node(node.left, names)
        _check_node(node.right, names)
        return

    if isinstance(node, ast.UnaryOp):
        if type(node.op) not in _UNARY_OPERATORS:
            raise StatisticError("Only +, -, * and / can be used in a formula.")
        _check_node(node.operand, names)
        return

    if isinstance(node, ast.Constant):
        # `True` is an int in Python; it is not a number anyone meant to type.
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise StatisticError(
                "A formula can only contain numbers and field references."
            )
        return

    if isinstance(node, ast.Name):
        if node.id in names:
            # A field outside any aggregate: on its own it says which entry's
            # value it would be, which a statistic cannot answer.
            raise StatisticError(
                "A field can only be read inside sum(), avg(), min() or max(), "
                "like sum({Hours})."
            )
        raise StatisticError(
            "Refer to a field by its name in braces, like {Hours}, "
            "and use numbers for everything else."
        )

    if isinstance(node, ast.Call):
        _check_call(node, names)
        return

    raise StatisticError(
        "A formula can only contain numbers, field references and "
        "sum(), avg(), min(), max() and count()."
    )


def compile_statistic(expression: str) -> tuple[ast.Expression, dict[str, str]]:
    """Parse a formula, or raise ``StatisticError`` explaining why not."""
    if not expression or not expression.strip():
        raise StatisticError("A statistic needs a formula.")

    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise StatisticError(
            f"A formula cannot be longer than {MAX_EXPRESSION_LENGTH} characters."
        )

    source, names = _substitute(expression)

    try:
        tree = ast.parse(source, mode="eval")
    except SyntaxError as error:
        raise StatisticError("This formula is incomplete or mistyped.") from error

    _check_node(tree.body, names)
    return tree, names


def _check_fields(
    node: ast.AST,
    names: dict[str, str],
    entry_schema: list[dict[str, Any]],
    project_name: str,
) -> None:
    """Resolve every aggregated field against the schema, or raise.

    Runs when a formula is saved or previewed rather than when it is
    evaluated: a wrong field should be caught by the one person who can fix
    it, at the moment they wrote it. The type rule is the same one computed
    fields follow — only number and computed fields may be aggregated.
    """
    if isinstance(node, ast.BinOp):
        _check_fields(node.left, names, entry_schema, project_name)
        _check_fields(node.right, names, entry_schema, project_name)
        return

    if isinstance(node, ast.UnaryOp):
        _check_fields(node.operand, names, entry_schema, project_name)
        return

    if isinstance(node, ast.Call):
        if node.func.id == "count":
            return

        token = names[node.args[0].id]
        field = _resolve_field(token, entry_schema)
        if field is None:
            _raise_unknown_field(token, entry_schema, project_name)
        if field.get("type") not in NUMERIC_FIELD_TYPES:
            raise StatisticError(
                f"{node.func.id}() needs a number field, and "
                f"'{field.get('name', token)}' is a {field.get('type')} field."
            )
        return


def _rewrite_references(
    expression: str, entry_schema: list[dict[str, Any]], *, by_id: bool
) -> str:
    """Rewrite every reference in a formula, to ids or to names.

    A token that resolves to nothing is left as it was, so a formula that
    skips ``validate_statistic`` still renders rather than crashing.
    """

    def replace(match: re.Match[str]) -> str:
        token = match.group(1)
        resolved = _resolve_field(token, entry_schema)
        if resolved is None:
            return match.group(0)
        key = resolved["id"] if by_id else str(resolved.get("name", token))
        return "{%s}" % key

    return PLACEHOLDER.sub(replace, expression or "")


def display_expression(expression: str, entry_schema: list[dict[str, Any]]) -> str:
    """The formula with every field written by name, for a person to read."""
    return _rewrite_references(expression, entry_schema, by_id=False)


def validate_statistic(
    expression: str,
    entry_schema: list[dict[str, Any]],
    project_name: str,
) -> str:
    """Check a formula against a project's schema, returning the stored form.

    The returned formula is canonicalised — every reference rewritten to the
    field's id — for the same reason a computed field's expression is:
    renaming a field is a label change and must not break what reads it.
    """
    tree, names = compile_statistic(expression)
    _check_fields(tree.body, names, entry_schema, project_name)
    return _rewrite_references(expression, entry_schema, by_id=True)


_SINGLE_FIELD_AGGREGATE = re.compile(r"^\s*(sum|avg|min|max)\s*\(\s*\{([^{}]+)\}\s*\)\s*$")
_BARE_COUNT = re.compile(r"^\s*count\s*\(\s*\)\s*$")


def describe_expression(expression: str, entry_schema: list[dict[str, Any]]) -> str:
    """A plain-English name for what a formula works out.

    The shapes the sentence builder produces get words — "Average of Hours" —
    so a saved card can say what it is without showing arithmetic. Anything
    written by hand is its own honest description, shown with fields by name.
    """
    match = _SINGLE_FIELD_AGGREGATE.match(expression or "")
    if match is not None:
        field = _resolve_field(match.group(2), entry_schema)
        field_name = str(field.get("name", match.group(2))) if field else match.group(2)
        return f"{AGGREGATE_WORDS[match.group(1)]} of {field_name}"

    if _BARE_COUNT.match(expression or ""):
        return "Count of entries"

    return display_expression(expression, entry_schema)


def _field_values(field_id: str, entries: list[Any]) -> tuple[list[float | int], set[int]]:
    """The numeric values of one field across a project's entries.

    Each value is read against its own entry's schema snapshot — the same
    rule ``read_field_statistics`` follows — so an entry that predates the
    field, or recorded it as another type, is excluded rather than misread.

    Returns the values and the positions of the entries that supplied them,
    so ``entries_used`` can be a count of entries rather than of values.
    """
    values: list[float | int] = []
    used: set[int] = set()

    for index, entry in enumerate(entries):
        snapshot = {field["id"]: field for field in (entry.schema_snapshot or [])}
        definition = snapshot.get(field_id)
        if definition is None or definition.get("type") not in NUMERIC_FIELD_TYPES:
            continue

        value = (entry.data or {}).get(field_id)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue

        values.append(value)
        used.add(index)

    return values, used


def _evaluate_call(
    node: ast.Call,
    values_by_identifier: dict[str, tuple[list[float | int], set[int]]],
    entries: list[Any],
    state: _EvaluationState,
) -> float | int | None:
    if node.func.id == "count":
        state.entries_used.update(range(len(entries)))
        return len(entries)

    values, used = values_by_identifier[node.args[0].id]
    state.entries_used.update(used)

    if not values:
        if state.note is None:
            state.note = "No entries match yet."
        return None

    name = node.func.id
    if name == "sum":
        return sum(values)
    if name == "avg":
        return sum(values) / len(values)
    if name == "min":
        return min(values)
    return max(values)


def _evaluate_node(
    node: ast.AST,
    values_by_identifier: dict[str, tuple[list[float | int], set[int]]],
    entries: list[Any],
    state: _EvaluationState,
) -> float | int | None:
    if isinstance(node, ast.BinOp):
        left = _evaluate_node(node.left, values_by_identifier, entries, state)
        right = _evaluate_node(node.right, values_by_identifier, entries, state)
        if left is None or right is None:
            return None

        if isinstance(node.op, ast.Div) and right == 0:
            # A division by zero is a state the logbook can legitimately be
            # in — the classic case is an average hand-written as
            # sum(...) / count() over a project with no entries yet. It
            # reads as "not known", with a note, rather than as an error.
            if state.note is None:
                state.note = (
                    "Division by zero: no entries match yet."
                    if not state.entries_used
                    else "Division by zero."
                )
            return None

        try:
            return _BINARY_OPERATORS[type(node.op)](left, right)
        except (ZeroDivisionError, OverflowError, ValueError):
            return None

    if isinstance(node, ast.UnaryOp):
        operand = _evaluate_node(node.operand, values_by_identifier, entries, state)
        return None if operand is None else _UNARY_OPERATORS[type(node.op)](operand)

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, ast.Call):
        return _evaluate_call(node, values_by_identifier, entries, state)

    return None  # Unreachable: compile_statistic admits nothing else.


def _round_result(result: float | int) -> float | int:
    """Trim binary floating-point noise from a displayed figure.

    Without this, an average of 0.1 and 0.2 shows as 0.15000000000000002,
    which reads as a bug rather than as arithmetic.
    """
    if isinstance(result, int):
        return result
    rounded = round(result, 6)
    return int(rounded) if rounded == int(rounded) else rounded


def evaluate_statistic(
    expression: str,
    entry_schema: list[dict[str, Any]],
    entries: list[Any],
    project_name: str,
) -> StatisticResult:
    """Evaluate a formula over a project's entries.

    ``entries`` are entry-like objects exposing ``schema_snapshot`` and
    ``data``. Raises ``StatisticError`` for a formula that is wrong against
    this schema — the caller turns that into a 400 — while a formula that is
    merely not answerable yet comes back as ``value=None`` with a note.
    """
    tree, names = compile_statistic(expression)
    _check_fields(tree.body, names, entry_schema, project_name)

    values_by_identifier: dict[str, tuple[list[float | int], set[int]]] = {}
    for identifier, token in names.items():
        field = _resolve_field(token, entry_schema)
        if field is None:
            # Only reachable for a formula that skipped validate_statistic —
            # saved formulas were validated when they were written.
            _raise_unknown_field(token, entry_schema, project_name)
        values_by_identifier[identifier] = _field_values(field["id"], entries)

    state = _EvaluationState()
    result = _evaluate_node(tree.body, values_by_identifier, entries, state)

    if result is None:
        return StatisticResult(
            value=None, entries_used=len(state.entries_used), note=state.note
        )

    try:
        finite = isfinite(result)
    except OverflowError:
        finite = False
    if not finite:
        return StatisticResult(
            value=None,
            entries_used=len(state.entries_used),
            note="The formula works out to a number too large to show.",
        )

    return StatisticResult(
        value=_round_result(result), entries_used=len(state.entries_used)
    )
