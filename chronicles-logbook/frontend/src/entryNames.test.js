import { describe, expect, it } from "vitest"

import { entryName, readableValues, suggestedTitle } from "./entryNames"

const ID = "f34dd73e-227b-4169-a665-0c1f41035e1a"

describe("entryName", () => {
  it("prefers the title somebody chose", () => {
    expect(entryName({ title: "  Sprint review ", data: { a: "ignored" } })).toBe("Sprint review")
  })

  it("names an untitled entry from its words and never from an id", () => {
    const entry = { data: { a: "Cool", b: ID, c: "second" } }

    expect(entryName(entry)).toBe("Cool · second")
    expect(readableValues(entry)).toEqual(["Cool", "second"])
    expect(suggestedTitle(entry)).toBe("Cool")
  })

  it("reads a link as a link, not as its id", () => {
    const entry = { data: { l: ID }, schema_snapshot: [{ id: "l", type: "link" }] }

    expect(entryName(entry)).toBe("↳ linked entry")
  })

  it("falls back to the day when there is nothing readable", () => {
    expect(entryName({ data: { a: ID }, created_at: "2026-09-29T08:00:00Z" })).toMatch(/^Untitled entry · /)
    expect(entryName({ data: {} })).toBe("Untitled entry")
    expect(suggestedTitle({ data: { a: ID } })).toBe("")
    expect(entryName(null)).toBe("An entry that is no longer there")
  })

  it("keeps a long name to one line", () => {
    expect(entryName({ title: "x".repeat(200) }).length).toBe(80)
  })
})
