import { describe, expect, it } from "vitest"

import {
  FIELD_TYPES,
  describeExpression,
  evaluateExpression,
  expressionError,
  fieldTypeLabel,
  isNumericField,
  parseExpression,
  referencedFieldIds,
  withComputedValues,
} from "./fieldTypes"

const hours = { id: "f-hours", name: "Hours", type: "number" }
const rate = { id: "f-rate", name: "Rate", type: "number" }
const notes = { id: "f-notes", name: "Notes", type: "text" }
const cost = { id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * {f-rate}" }

// ── Field types (US-2.4, US-2.5) ─────────────────────────────────────────────

describe("field types", () => {
  it("offers a project link and a calculation alongside the original four", () => {
    expect(FIELD_TYPES.map((type) => type.value)).toEqual([
      "text",
      "number",
      "date",
      "dropdown",
      "project_reference",
      "computed",
    ])
  })

  it("gives every type a label and a hint, since the builder shows both", () => {
    for (const type of FIELD_TYPES) {
      expect(type.label).toBeTruthy()
      expect(type.hint).toBeTruthy()
    }
  })

  it("labels a type in the builder's language rather than the API's", () => {
    expect(fieldTypeLabel("project_reference")).toBe("Project link")
    expect(fieldTypeLabel("computed")).toBe("Calculation")
  })

  it("falls back to the raw type when it does not recognise one", () => {
    // A schema saved by a newer version should still render, not crash.
    expect(fieldTypeLabel("signature")).toBe("signature")
  })

  it("treats numbers and calculations as the only figures", () => {
    expect(isNumericField(hours)).toBe(true)
    expect(isNumericField(cost)).toBe(true)
    expect(isNumericField(notes)).toBe(false)
    expect(isNumericField(undefined)).toBe(false)
  })
})

// ── Parsing (US-2.5) ─────────────────────────────────────────────────────────

describe("parsing an expression", () => {
  it("reads the field ids an expression uses, once each and in order", () => {
    expect(referencedFieldIds("{b} + {a} - {b}")).toEqual(["b", "a"])
  })

  it("ignores whitespace inside a reference", () => {
    expect(referencedFieldIds("{ f-hours }")).toEqual(["f-hours"])
  })

  it("finds no references in an empty expression", () => {
    expect(referencedFieldIds("")).toEqual([])
    expect(referencedFieldIds(null)).toEqual([])
  })

  it("accepts arithmetic, parentheses and a leading sign", () => {
    expect(() => parseExpression("-({a} + 2) * 3 / 4")).not.toThrow()
  })

  it("rejects an unclosed reference", () => {
    expect(() => parseExpression("{a + 1")).toThrow(/closing brace/)
  })

  it("rejects anything that is not arithmetic", () => {
    // The grammar is narrow on purpose: an expression is data a user typed,
    // and the only safe way to run it is to not be able to express much.
    expect(() => parseExpression("alert(1)")).toThrow(/can only contain/)
    expect(() => parseExpression("{a} % 2")).toThrow(/can only contain/)
    expect(() => parseExpression("'text'")).toThrow(/can only contain/)
  })

  it("rejects an incomplete expression", () => {
    expect(() => parseExpression("{a} +")).toThrow(/incomplete or mistyped/)
    expect(() => parseExpression("({a}")).toThrow(/incomplete or mistyped/)
    expect(() => parseExpression("{a} {b}")).toThrow(/incomplete or mistyped/)
  })

  it("rejects an empty expression", () => {
    expect(() => parseExpression("   ")).toThrow(/needs an expression/)
  })
})

// ── Evaluating (US-2.5) ──────────────────────────────────────────────────────

describe("evaluating an expression", () => {
  it("applies the usual precedence", () => {
    expect(evaluateExpression("2 + 3 * 4", {})).toBe(14)
    expect(evaluateExpression("(2 + 3) * 4", {})).toBe(20)
  })

  it("reads values from the entry", () => {
    expect(evaluateExpression("{f-hours} * {f-rate}", { "f-hours": 3, "f-rate": 50 })).toBe(150)
  })

  it("reads a figure still held as the string an input produced", () => {
    // Every value coming out of an <input> is a string, so a calculation that
    // only understood numbers would stay blank while the entry was typed.
    expect(evaluateExpression("{f-hours} + 1", { "f-hours": "3.5" })).toBe(4.5)
  })

  it("is unknown while a source is empty", () => {
    expect(evaluateExpression("{f-hours} + 1", {})).toBeNull()
    expect(evaluateExpression("{f-hours} + 1", { "f-hours": "" })).toBeNull()
  })

  it("is unknown when a source is not a figure", () => {
    expect(evaluateExpression("{f-notes} + 1", { "f-notes": "hello" })).toBeNull()
    expect(evaluateExpression("{f-notes} + 1", { "f-notes": true })).toBeNull()
  })

  it("is unknown rather than infinite when dividing by nothing", () => {
    expect(evaluateExpression("{f-hours} / 0", { "f-hours": 5 })).toBeNull()
  })

  it("is unknown when the expression cannot be parsed", () => {
    // Shown while a field is half-typed, so this must not throw.
    expect(evaluateExpression("{f-hours} +", { "f-hours": 5 })).toBeNull()
  })

  it("rounds away binary floating-point noise", () => {
    expect(evaluateExpression("0.1 + 0.2", {})).toBe(0.3)
  })
})

// ── Filling in an entry (US-2.5) ─────────────────────────────────────────────

describe("computed values on an entry", () => {
  it("leaves the values alone when nothing is calculated", () => {
    const values = { "f-hours": 3 }
    expect(withComputedValues(values, [hours, notes])).toBe(values)
  })

  it("works out every calculation in the schema", () => {
    const result = withComputedValues({ "f-hours": 3, "f-rate": 50 }, [hours, rate, cost])
    expect(result["f-cost"]).toBe(150)
  })

  it("lets one calculation read another, whatever order they are in", () => {
    const withVat = {
      id: "f-vat",
      name: "With VAT",
      type: "computed",
      expression: "{f-cost} * 1.15",
    }
    const result = withComputedValues({ "f-hours": 2, "f-rate": 100 }, [withVat, cost, hours, rate])
    expect(result["f-cost"]).toBe(200)
    expect(result["f-vat"]).toBe(230)
  })

  it("does not hang on a circular reference", () => {
    // The server refuses to save one, but a schema can be mid-edit here.
    const a = { id: "a", name: "A", type: "computed", expression: "{b} + 1" }
    const b = { id: "b", name: "B", type: "computed", expression: "{a} + 1" }
    expect(withComputedValues({}, [a, b])).toEqual({ a: null, b: null })
  })

  it("does not alter what it was given", () => {
    const values = { "f-hours": 3, "f-rate": 50 }
    withComputedValues(values, [hours, rate, cost])
    expect(values).toEqual({ "f-hours": 3, "f-rate": 50 })
  })
})

// ── Explaining a problem (US-2.5) ────────────────────────────────────────────

describe("expression problems", () => {
  const schema = [hours, rate, notes, cost]

  it("accepts a calculation over number fields", () => {
    expect(expressionError("{f-hours} * {f-rate}", cost, schema)).toBeNull()
  })

  it("accepts a calculation that reads another calculation", () => {
    const total = { id: "f-total", name: "Total", type: "computed" }
    expect(expressionError("{f-cost} + 1", total, [...schema, total])).toBeNull()
  })

  it("asks for an expression when the field has none", () => {
    expect(expressionError("", cost, schema)).toMatch(/needs an expression/)
  })

  it("reports a parse problem in words a user can act on", () => {
    expect(expressionError("{f-hours} *", cost, schema)).toMatch(/incomplete or mistyped/)
  })

  it("refuses a calculation that reads itself", () => {
    expect(expressionError("{f-cost} + 1", cost, schema)).toMatch(/its own result/)
  })

  it("refuses a source that is not in the schema", () => {
    expect(expressionError("{f-gone} + 1", cost, schema)).toMatch(/no longer in the schema/)
  })

  it("names the field that is not a number", () => {
    expect(expressionError("{f-notes} + 1", cost, schema)).toBe(
      "'Notes' is not a number, so it cannot be part of a calculation."
    )
  })
})

// ── Reading a calculation back (US-2.5) ──────────────────────────────────────

describe("describing an expression", () => {
  it("replaces ids with names, since ids are not for reading", () => {
    expect(describeExpression("{f-hours} * {f-rate}", [hours, rate])).toBe("Hours * Rate")
  })

  it("says so when a source has gone", () => {
    expect(describeExpression("{f-gone} + 1", [hours])).toBe("unknown field + 1")
  })

  it("copes with no expression at all", () => {
    expect(describeExpression(undefined, [hours])).toBe("")
  })
})
