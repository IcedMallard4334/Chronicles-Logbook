"""Tests for the computed-field expression engine (US-2.5)."""

import pytest

from app.computed import (
    ExpressionError,
    apply_computed_fields,
    computed_evaluation_order,
    evaluate,
    referenced_field_ids,
    validate_computed_fields,
)


def test_referenced_field_ids_in_order_of_appearance():
    assert referenced_field_ids("{b} + {a} * {b}") == ["b", "a"]


def test_referenced_field_ids_tolerates_spacing():
    assert referenced_field_ids("{ field-1 } / 2") == ["field-1"]


def test_referenced_field_ids_of_a_constant_expression():
    assert referenced_field_ids("60 * 24") == []


def test_evaluate_arithmetic():
    assert evaluate("{a} + {b} * 2", {"a": 1, "b": 3}) == 7


def test_evaluate_respects_parentheses():
    assert evaluate("({a} + {b}) * 2", {"a": 1, "b": 3}) == 8


def test_evaluate_handles_a_negative_sign():
    assert evaluate("-{a}", {"a": 5}) == -5


def test_evaluate_trims_floating_point_noise():
    # Plain float arithmetic gives 0.30000000000000004, which reads as a bug.
    assert evaluate("{a} + {b}", {"a": 0.1, "b": 0.2}) == 0.3


def test_evaluate_returns_a_whole_number_when_division_is_exact():
    assert evaluate("{a} / {b}", {"a": 10, "b": 2}) == 5


def test_evaluate_is_none_when_a_source_is_missing():
    assert evaluate("{a} + {b}", {"a": 1}) is None


def test_evaluate_is_none_when_a_source_is_not_a_number():
    assert evaluate("{a} * 2", {"a": "seven"}) is None


def test_evaluate_is_none_on_division_by_zero():
    # An average over a day with nothing logged: a legitimate state, not an error.
    assert evaluate("{a} / {b}", {"a": 10, "b": 0}) is None


def test_evaluate_rejects_a_boolean_as_a_number():
    assert evaluate("{a} + 1", {"a": True}) is None


@pytest.mark.parametrize(
    "expression",
    [
        "2 ** 32",           # exponentiation is a denial of service in three characters
        "{a} % 2",           # not arithmetic anyone needs in a logbook
        "abs({a})",          # calls
        "{a}.real",          # attributes
        "total",             # bare names
        "'text' + 'more'",   # non-numeric constants
        "{a} > 1",           # comparisons
        "[1, 2]",            # containers
    ],
)
def test_compile_rejects_anything_that_is_not_arithmetic(expression):
    with pytest.raises(ExpressionError):
        evaluate(expression, {"a": 1})


def test_compile_rejects_an_empty_expression():
    with pytest.raises(ExpressionError, match="needs an expression"):
        evaluate("   ", {})


def test_compile_rejects_an_incomplete_expression():
    with pytest.raises(ExpressionError, match="incomplete or mistyped"):
        evaluate("{a} +", {"a": 1})


def test_compile_rejects_an_over_long_expression():
    with pytest.raises(ExpressionError, match="cannot be longer than"):
        evaluate("1 + " * 200 + "1", {})


def test_evaluation_order_puts_sources_first():
    schema = [
        {"id": "hours", "name": "Hours", "type": "number"},
        {"id": "total", "name": "Total", "type": "computed", "expression": "{rate} * {hours}"},
        {"id": "rate", "name": "Rate", "type": "computed", "expression": "{hours} / 8"},
    ]
    order = computed_evaluation_order(schema)
    assert order.index("rate") < order.index("total")


def test_evaluation_order_rejects_a_cycle():
    schema = [
        {"id": "a", "name": "A", "type": "computed", "expression": "{b} + 1"},
        {"id": "b", "name": "B", "type": "computed", "expression": "{a} + 1"},
    ]
    with pytest.raises(ExpressionError, match="computed from itself"):
        computed_evaluation_order(schema)


def test_validate_rejects_a_field_computed_from_itself():
    schema = [
        {"id": "a", "name": "Total", "type": "computed", "expression": "{a} + 1"},
    ]
    with pytest.raises(ExpressionError, match="'Total' cannot be computed from itself"):
        validate_computed_fields(schema)


def test_validate_rejects_a_reference_to_a_field_that_is_not_there():
    schema = [
        {"id": "a", "name": "Total", "type": "computed", "expression": "{gone} + 1"},
    ]
    with pytest.raises(ExpressionError, match="not in this schema"):
        validate_computed_fields(schema)


def test_validate_rejects_arithmetic_over_a_text_field():
    schema = [
        {"id": "notes", "name": "Notes", "type": "text"},
        {"id": "a", "name": "Total", "type": "computed", "expression": "{notes} * 2"},
    ]
    with pytest.raises(ExpressionError, match="only be computed from number"):
        validate_computed_fields(schema)


def test_validate_accepts_a_chain_of_computed_fields():
    schema = [
        {"id": "hours", "name": "Hours", "type": "number"},
        {"id": "minutes", "name": "Minutes", "type": "computed", "expression": "{hours} * 60"},
        {"id": "half", "name": "Half", "type": "computed", "expression": "{minutes} / 2"},
    ]
    validate_computed_fields(schema)


def test_apply_fills_in_a_chain_in_dependency_order():
    schema = [
        {"id": "hours", "name": "Hours", "type": "number"},
        {"id": "minutes", "name": "Minutes", "type": "computed", "expression": "{hours} * 60"},
        {"id": "half", "name": "Half", "type": "computed", "expression": "{minutes} / 2"},
    ]
    result = apply_computed_fields({"hours": 2}, schema)
    assert result["minutes"] == 120
    assert result["half"] == 60


def test_apply_overwrites_a_value_the_caller_supplied():
    schema = [
        {"id": "hours", "name": "Hours", "type": "number"},
        {"id": "total", "name": "Total", "type": "computed", "expression": "{hours} * 60"},
    ]
    result = apply_computed_fields({"hours": 1, "total": 99999}, schema)
    assert result["total"] == 60


def test_apply_does_not_mutate_the_data_it_was_given():
    schema = [
        {"id": "hours", "name": "Hours", "type": "number"},
        {"id": "total", "name": "Total", "type": "computed", "expression": "{hours} * 60"},
    ]
    data = {"hours": 1}
    apply_computed_fields(data, schema)
    assert data == {"hours": 1}


def test_apply_leaves_a_schema_without_computed_fields_alone():
    schema = [{"id": "hours", "name": "Hours", "type": "number"}]
    data = {"hours": 1}
    assert apply_computed_fields(data, schema) is data
