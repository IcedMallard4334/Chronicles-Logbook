import { describe, expect, it } from "vitest"

import {
  FIELD_TYPES,
  FIELD_TYPE_META,
  describeExpression,
  evaluateExpression,
  expressionCanonical,
  expressionError,
  expressionToDisplay,
  fieldTypeLabel,
  isNumericField,
  parseExpression,
  previewExpressionValue,
  referencedFieldIds,
  renameFieldInExpression,
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

  it("keeps each type's label, hint and badge in one registry", () => {
    // One place decides what a type is called and how it is marked, so the
    // builder, the entry form and the table cannot drift apart. Only the
    // two read-only types get a badge — a plain field needs no callout,
    // because being plain is the default a reader assumes.
    expect(FIELD_TYPE_META.project_reference.badge).toBe("Linked")
    expect(FIELD_TYPE_META.computed.badge).toBe("Calculated")
    for (const type of FIELD_TYPES) {
      if (type.value === "computed" || type.value === "project_reference") {
        expect(type.badge).toBeTruthy()
        expect(type.color).toBeTruthy()
      } else {
        expect(type.badge).toBeNull()
      }
    }
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

  it("explains a field name typed without braces", () => {
    // "Hours * 2" is the natural first attempt, so it is answered in kind
    // rather than reported as a stray character.
    expect(() => parseExpression("Hours * 2")).toThrow(/Refer to a field by its name in braces/)
  })

  it("rejects anything that is not arithmetic", () => {
    // The grammar is narrow on purpose: an expression is data a user typed,
    // and the only safe way to run it is to not be able to express much.
    // "alert(1)" leads with a bare name, so it is answered with the same
    // advice a mistyped field name gets; the rest simply cannot be expressed.
    expect(() => parseExpression("alert(1)")).toThrow(/Refer to a field by its name in braces/)
    expect(() => parseExpression("{a} % 2")).toThrow(/can only contain/)
    expect(() => parseExpression("'text'")).toThrow(/can only contain/)
  })

  it("rejects an incomplete expression", () => {
    expect(() => parseExpression("{a} +")).toThrow(/incomplete or mistyped/)
    expect(() => parseExpression("({a}")).toThrow(/incomplete or mistyped/)
    expect(() => parseExpression("{a} {b}")).toThrow(/incomplete or mistyped/)
  })

  it("rejects an operator where a value should be", () => {
    // "* 2" stops the parser where a figure or a reference belongs, and gets
    // the same words every other misstep gets.
    expect(() => parseExpression("* 2")).toThrow(/incomplete or mistyped/)
    expect(() => parseExpression("{a} * * 2")).toThrow(/incomplete or mistyped/)
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

  it("subtracts and divides as well as it adds and multiplies", () => {
    expect(evaluateExpression("{f-rate} - {f-hours}", { "f-rate": 50, "f-hours": 3 })).toBe(47)
    expect(evaluateExpression("{f-rate} / {f-hours}", { "f-rate": 50, "f-hours": 4 })).toBe(12.5)
  })

  it("applies a leading sign to the figure it stands on", () => {
    expect(evaluateExpression("-{f-hours} * 2", { "f-hours": 3 })).toBe(-6)
    expect(evaluateExpression("+{f-hours}", { "f-hours": 3 })).toBe(3)
  })

  it("is unknown when a sign stands on a figure that is not there", () => {
    expect(evaluateExpression("-{f-hours}", {})).toBeNull()
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

  it("resolves a calculation written with field names", () => {
    // The builder edits by name and the server stores by id, so a schema in
    // either form has to evaluate the same.
    const namedCost = { ...cost, expression: "{Hours} * {Rate}" }
    const result = withComputedValues({ "f-hours": 3, "f-rate": 50 }, [hours, rate, namedCost])
    expect(result["f-cost"]).toBe(150)
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

  it("recognises a field typed by name inside braces", () => {
    // A name is what a person knows and the id is what the server stores;
    // both name the same field, so both are accepted.
    expect(expressionError("{Hours} * 2", cost, schema)).toBeNull()
  })

  it("still names a non-number typed by name", () => {
    expect(expressionError("{Notes} + 1", cost, schema)).toBe(
      "'Notes' is not a number, so it cannot be part of a calculation."
    )
  })

  it("refuses a calculation that names itself", () => {
    expect(expressionError("{Cost} + 1", cost, schema)).toMatch(/its own result/)
  })
})

// ── Previewing a calculation (US-2.5) ────────────────────────────────────────

describe("previewing an expression", () => {
  it("prefers the figures from the latest entry", () => {
    expect(
      previewExpressionValue("{f-hours} * {f-rate}", { "f-hours": 3, "f-rate": 50 })
    ).toEqual({ value: 150, fromEntry: true })
  })

  it("counts every field as 2 when there is no entry to read", () => {
    expect(previewExpressionValue("{f-hours} * {f-rate}", null)).toEqual({
      value: 4,
      fromEntry: false,
    })
  })

  it("falls back to samples when the entry cannot answer the formula", () => {
    // An entry recorded before a field was added to the schema, say.
    expect(previewExpressionValue("{f-hours} * {f-rate}", { "f-hours": 3 })).toEqual({
      value: 4,
      fromEntry: false,
    })
  })

  it("needs no entry at all for plain arithmetic", () => {
    expect(previewExpressionValue("2 + 3")).toEqual({ value: 5, fromEntry: false })
  })

  it("gives up quietly on something it cannot evaluate", () => {
    expect(previewExpressionValue("{f-hours} *", null)).toBeNull()
  })

  it("previews a calculation written with field names", () => {
    expect(
      previewExpressionValue("{Hours} * {Rate}", { "f-hours": 3, "f-rate": 50 }, [hours, rate])
    ).toEqual({ value: 150, fromEntry: true })
  })

  it("samples a calculation written with field names when there is no entry", () => {
    expect(previewExpressionValue("{Hours} * {Rate}", null, [hours, rate])).toEqual({
      value: 4,
      fromEntry: false,
    })
  })
})

// ── Writing a calculation the way the server stores it (US-2.5) ─────────────

describe("the canonical and displayed forms of an expression", () => {
  it("writes references as ids for the server, from names or from ids", () => {
    expect(expressionCanonical("{Hours} * {f-rate}", [hours, rate])).toBe("{f-hours} * {f-rate}")
  })

  it("matches a name ignoring case and surrounding space", () => {
    expect(expressionCanonical("{ hours } + 1", [hours])).toBe("{f-hours} + 1")
  })

  it("leaves a reference that names nothing exactly as it was", () => {
    // It cannot be resolved here either, so the field reads as unknown
    // rather than being silently rewritten into something else.
    expect(expressionCanonical("{gone} + 1", [hours])).toBe("{gone} + 1")
  })

  it("writes references as names for the editor, from ids", () => {
    expect(expressionToDisplay("{f-hours} * {f-rate}", [hours, rate])).toBe("{Hours} * {Rate}")
  })

  it("leaves a reference that names nothing for its reader to see", () => {
    expect(expressionToDisplay("{gone} + 1", [hours])).toBe("{gone} + 1")
  })

  it("carries a rename into every reference to the field", () => {
    expect(renameFieldInExpression("{Hours} * {Hours} + {Rate}", "Hours", "Duration")).toBe(
      "{Duration} * {Duration} + {Rate}"
    )
  })

  it("matches the old name ignoring case when carrying a rename", () => {
    expect(renameFieldInExpression("{hours} + 1", "Hours", "Duration")).toBe(
      "{Duration} + 1"
    )
  })

  it("leaves an empty old name alone rather than rewriting everything", () => {
    // A field being named for the first time has no old name to replace.
    expect(renameFieldInExpression("{Hours} + 1", "", "Duration")).toBe("{Hours} + 1")
  })
})

// ── Reading a calculation back (US-2.5) ──────────────────────────────────────

describe("describing an expression", () => {
  it("replaces ids with names, since ids are not for reading", () => {
    expect(describeExpression("{f-hours} * {f-rate}", [hours, rate])).toBe("Hours * Rate")
  })

  it("reads a reference already written by name", () => {
    expect(describeExpression("{Hours} + 1", [hours])).toBe("Hours + 1")
  })

  it("says so when a source has gone", () => {
    expect(describeExpression("{f-gone} + 1", [hours])).toBe("unknown field + 1")
  })

  it("copes with no expression at all", () => {
    expect(describeExpression(undefined, [hours])).toBe("")
  })
})
