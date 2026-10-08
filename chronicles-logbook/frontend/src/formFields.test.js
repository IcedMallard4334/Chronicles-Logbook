import { describe, expect, it } from "vitest"

import {
  BUILT_IN_FIELDS, TITLE_MAX, defaultSchemaFields, isBuiltInName, missingRequired, missingRequiredMessage,
} from "./formFields"

describe("the built-in fields", () => {
  it("are a title and the time it took, with their types", () => {
    expect(BUILT_IN_FIELDS.map((field) => [field.name, field.typeLabel])).toEqual([
      ["Title", "Short text"], ["Hours spent", "Number"], ["Minutes spent", "Number"],
    ])
    expect(TITLE_MAX).toBe(255)
  })

  it("reserve their names, whatever the case or spacing", () => {
    expect(isBuiltInName("title")).toBe(true)
    expect(isBuiltInName("  Hours Spent ")).toBe(true)
    expect(isBuiltInName("Hours")).toBe(false)
    expect(isBuiltInName(undefined)).toBe(false)
  })
})

describe("defaultSchemaFields", () => {
  it("gives a new project a description and a date that nothing demands", () => {
    let count = 0
    const fields = defaultSchemaFields(() => `id-${++count}`)

    expect(fields).toEqual([
      { id: "id-1", name: "Description", type: "long_text", required: false },
      { id: "id-2", name: "Date", type: "date", required: false },
    ])
  })
})

describe("missingRequired", () => {
  const schema = [
    { id: "a", name: "Place", type: "text" },
    { id: "b", name: "Story", type: "long_text", required: false },
    { id: "c", name: "Count", type: "number" },
    { id: "d", name: "Kind", type: "dropdown", options: ["x"] },
    { id: "e", name: "Labels", type: "tags" },
    { id: "f", name: "Steps", type: "checklist" },
    { id: "g", name: "Follows", type: "link" },
    { id: "h", name: "Total", type: "computed" },
  ]

  it("names the required fields that are empty, and only those", () => {
    expect(missingRequired(schema, { a: "  ", c: "", d: undefined })).toEqual(["Place", "Count", "Kind"])
    expect(missingRequired(schema, { a: "here", c: 0, d: "x" })).toEqual([])
  })

  it("asks for nothing while the entry is still to do", () => {
    expect(missingRequired(schema, {}, { todo: true })).toEqual([])
  })

  it("leaves a field a rule fills to the rule", () => {
    expect(missingRequired(schema, { c: 1, d: "x" }, { ruleFillable: new Set(["a"]) })).toEqual([])
  })

  it("does not hold an entry to a field that was already empty when it was saved", () => {
    expect(missingRequired(schema, { a: "", c: 1, d: "x" }, { previous: { a: "" } })).toEqual([])
    // A field the entry never had is still asked for.
    expect(missingRequired(schema, { a: "", c: 1, d: "x" }, { previous: {} })).toEqual(["Place"])
  })

  it("does not judge tags, checklists, links or calculated fields here", () => {
    expect(missingRequired(schema.filter((field) => ["e", "f", "g", "h"].includes(field.id)), {})).toEqual([])
  })
})

describe("missingRequiredMessage", () => {
  it("is null when nothing is missing, and reads as a sentence otherwise", () => {
    expect(missingRequiredMessage([])).toBeNull()
    expect(missingRequiredMessage(["Place"])).toBe("Fill in Place before saving.")
    expect(missingRequiredMessage(["A", "B", "C"])).toBe("Fill in A, B and C before saving.")
  })
})
