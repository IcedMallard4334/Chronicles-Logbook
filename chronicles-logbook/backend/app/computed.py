"""Fields whose value is derived from other fields (US-2.5).

A computed field carries an expression instead of a value. Its worth is that
the owner never types a figure the logbook could work out, so the expression
is evaluated on the server, on every write, and the result is stored in the
entry alongside the fields it came from.

Storing the result rather than resolving it at read time is deliberate. Every
existing reader — the timeline, global search, the CSV export, statistics —
already reads ``Entry.data``, so a stored value is visible to all of them
without each learning what a computed field is.

The expression is user input, so it is never handed to ``eval``. It is parsed
with ``ast`` and walked against an allowlist that admits nothing but
arithmetic: no calls, no attributes, no names beyond the field references the
expression declares. Exponentiation is left out on purpose — ``2 ** 999999999``
is a denial of service in three characters, and no logbook needs it.
"""

import ast
import operator
import re
from typing import Any

# A field is referenced by its id in braces, e.g. "{field-abc} * 1.15". Ids
# contain hyphens, so they cannot be written as bare Python identifiers.
PLACEHOLDER = re.compile(r"\{\s*([^{}]+?)\s*\}")

# Long enough for any arithmetic a logbook needs, short enough that parsing
# stays trivial.
MAX_EXPRESSION_LENGTH = 500

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

# Field types a computed field is allowed to read. Arithmetic over a date or a
# dropdown label has no meaning, and allowing it would only produce nulls the
# owner cannot explain.
NUMERIC_FIELD_TYPES = frozenset({"number", "computed"})


class ExpressionError(ValueError):
    """An expression that cannot be stored, with a message fit to show a user."""


def referenced_field_ids(expression: str) -> list[str]:
    """The field ids an expression reads, in the order they first appear."""
    seen: list[str] = []
    for match in PLACEHOLDER.finditer(expression or ""):
        field_id = match.group(1)
        if field_id not in seen:
            seen.append(field_id)
    return seen


def _substitute(expression: str) -> tuple[str, dict[str, str]]:
    """Rewrite ``{field-id}`` as a plain identifier Python can parse.

    Returns the rewritten source and a mapping from each generated identifier
    back to the field id it stands for. Two occurrences of the same field get
    two identifiers pointing at the same id, which keeps the substitution a
    single pass.
    """
    names: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        name = f"_ref{len(names)}"
        names[name] = match.group(1)
        return name

    return PLACEHOLDER.sub(replace, expression), names


def _reject_disallowed_nodes(node: ast.AST, names: dict[str, str]) -> None:
    """Walk the tree, refusing anything that is not arithmetic."""
    if isinstance(node, ast.BinOp):
        if type(node.op) not in _BINARY_OPERATORS:
            raise ExpressionError("Only +, -, * and / can be used in an expression.")
        _reject_disallowed_nodes(node.left, names)
        _reject_disallowed_nodes(node.right, names)
        return

    if isinstance(node, ast.UnaryOp):
        if type(node.op) not in _UNARY_OPERATORS:
            raise ExpressionError("Only +, -, * and / can be used in an expression.")
        _reject_disallowed_nodes(node.operand, names)
        return

    if isinstance(node, ast.Constant):
        # `True` is an int in Python; it is not a number anyone meant to type.
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ExpressionError("An expression can only contain numbers and field references.")
        return

    if isinstance(node, ast.Name):
        if node.id not in names:
            raise ExpressionError(
                "Refer to a field as {field id} rather than by name, "
                "and use numbers for everything else."
            )
        return

    raise ExpressionError("An expression can only contain numbers, field references and + - * /.")


def compile_expression(expression: str) -> tuple[ast.Expression, dict[str, str]]:
    """Parse an expression, or raise ``ExpressionError`` explaining why not."""
    if not expression or not expression.strip():
        raise ExpressionError("A computed field needs an expression.")

    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ExpressionError(
            f"An expression cannot be longer than {MAX_EXPRESSION_LENGTH} characters."
        )

    source, names = _substitute(expression)

    try:
        tree = ast.parse(source, mode="eval")
    except SyntaxError as error:
        raise ExpressionError("This expression is incomplete or mistyped.") from error

    _reject_disallowed_nodes(tree.body, names)
    return tree, names


def _as_number(value: Any) -> float | int | None:
    """Read a stored value as a number, or ``None`` if it is not one."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _evaluate_node(node: ast.AST, names: dict[str, str], values: dict[str, Any]):
    if isinstance(node, ast.BinOp):
        left = _evaluate_node(node.left, names, values)
        right = _evaluate_node(node.right, names, values)
        if left is None or right is None:
            return None
        try:
            return _BINARY_OPERATORS[type(node.op)](left, right)
        except (ZeroDivisionError, OverflowError, ValueError):
            # A division by zero is a state the data can legitimately be in —
            # an average over a day with no hours logged. It leaves the field
            # unknown rather than failing the whole write.
            return None

    if isinstance(node, ast.UnaryOp):
        operand = _evaluate_node(node.operand, names, values)
        return None if operand is None else _UNARY_OPERATORS[type(node.op)](operand)

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, ast.Name):
        return _as_number(values.get(names[node.id]))

    return None


def evaluate(expression: str, values: dict[str, Any]) -> float | int | None:
    """Evaluate an expression against a field-id to value mapping.

    ``None`` means "not known yet": a source field is empty, holds something
    that is not a number, or the arithmetic could not be carried out. A
    computed field is a convenience, and a half-filled entry should still
    save.
    """
    tree, names = compile_expression(expression)
    result = _evaluate_node(tree.body, names, values)
    return None if result is None else _round_result(result)


def _round_result(result: float | int) -> float | int:
    """Trim binary floating-point noise from a displayed figure.

    Without this, 0.1 + 0.2 is stored as 0.30000000000000004 and shown that
    way in the entry list, which reads as a bug rather than as arithmetic.
    """
    if isinstance(result, int):
        return result
    rounded = round(result, 6)
    return int(rounded) if rounded == int(rounded) else rounded


def computed_evaluation_order(entry_schema: list[dict[str, Any]]) -> list[str]:
    """Computed field ids, ordered so each is evaluated after its sources.

    A computed field may read another computed field, which is worth having —
    a rate, then a total, then a running average — but means the order of
    evaluation matters and that cycles have to be refused. Raises
    ``ExpressionError`` when the references cannot be laid out in order,
    which is exactly when a cycle exists.
    """
    computed = {
        field["id"]: field
        for field in entry_schema
        if field.get("type") == "computed"
    }

    order: list[str] = []
    resolved: set[str] = set()
    # Field ids on the current path, so a cycle is reported against the field
    # that closes it rather than against an arbitrary member.
    visiting: set[str] = set()

    def visit(field_id: str) -> None:
        if field_id in resolved:
            return
        if field_id in visiting:
            name = computed[field_id].get("name", field_id)
            raise ExpressionError(
                f"Field '{name}' is computed from itself, directly or through another field."
            )

        visiting.add(field_id)
        for reference in referenced_field_ids(computed[field_id].get("expression", "")):
            if reference in computed:
                visit(reference)
        visiting.discard(field_id)

        resolved.add(field_id)
        order.append(field_id)

    for field_id in computed:
        visit(field_id)

    return order


def validate_computed_fields(entry_schema: list[dict[str, Any]]) -> None:
    """Check every computed field in a schema, or raise ``ExpressionError``.

    Runs when a schema is saved rather than when an entry is written: a broken
    expression should be caught by the one person who can fix it, at the
    moment they wrote it, not by whoever next tries to log an entry.
    """
    by_id = {field["id"]: field for field in entry_schema}

    for field in entry_schema:
        if field.get("type") != "computed":
            continue

        name = field.get("name", field["id"])
        compile_expression(field.get("expression", ""))

        for reference in referenced_field_ids(field["expression"]):
            if reference == field["id"]:
                raise ExpressionError(f"Field '{name}' cannot be computed from itself.")

            source = by_id.get(reference)
            if source is None:
                raise ExpressionError(
                    f"Field '{name}' refers to a field that is not in this schema."
                )
            if source.get("type") not in NUMERIC_FIELD_TYPES:
                raise ExpressionError(
                    f"Field '{name}' can only be computed from number "
                    f"or computed fields, and '{source.get('name', reference)}' is "
                    f"a {source.get('type')} field."
                )

    computed_evaluation_order(entry_schema)


def apply_computed_fields(
    data: dict[str, Any],
    entry_schema: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return ``data`` with every computed field's value filled in.

    Any value the caller supplied for a computed field is replaced. The field
    is read-only in the entry form, and offline sync replays whatever payload
    it captured, so the server derives the value rather than trusting it.
    """
    computed = {
        field["id"]: field
        for field in entry_schema
        if field.get("type") == "computed"
    }
    if not computed:
        return data

    result = dict(data)
    for field_id in computed_evaluation_order(entry_schema):
        result[field_id] = evaluate(computed[field_id].get("expression", ""), result)

    return result
