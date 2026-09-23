/**
 * Reading an entry back.
 *
 * Two things are under test, and they are the two things that were broken.
 * First, that a stored value renders as the kind of thing it is rather than as
 * `String(value)` — which turned tags into "a,b", checklists into
 * "[object Object]" and links into bare uuids. Second, that a list can show
 * entries written under different versions of a format without either losing
 * the older ones or pretending they answered questions nobody asked them.
 */

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  NOT_RECORDED,
  ValueView,
  cellFor,
  columnsFor,
  entrySummary,
  sameFormat,
  schemaForEntry,
  valueToText,
} from "./entryValues"

const HOURS = { id: "hours", name: "Hours", type: "number" }
const NOTE = { id: "note", name: "Note", type: "text" }
const TAGS = { id: "tags", name: "Topics", type: "tags" }
const STEPS = { id: "steps", name: "Steps", type: "checklist" }
const MOOD = { id: "mood", name: "Mood", type: "text" }

const project = {
  id: "p1",
  name: "Thesis",
  entry_schema: [NOTE, HOURS, TAGS, STEPS],
  retired_schema: [MOOD],
}

const entry = {
  id: "e1",
  project_id: "p1",
  data: {
    note: "Reran the calibration",
    hours: 3,
    tags: ["reading", "draft"],
    steps: [
      { id: "a", text: "Outline", completed: true },
      { id: "b", text: "Draft", completed: false },
    ],
  },
  schema_snapshot: [NOTE, HOURS, TAGS, STEPS],
  created_at: "2026-09-12T10:00:00Z",
}

describe("rendering a value", () => {
  it("draws tags as chips rather than a comma-joined string", () => {
    render(<ValueView value={["reading", "draft"]} field={TAGS} />)

    expect(screen.getByText("reading")).toBeInTheDocument()
    expect(screen.getByText("draft")).toBeInTheDocument()
    expect(screen.queryByText("reading,draft")).toBeNull()
  })

  it("draws a checklist as progress rather than as object soup", () => {
    render(<ValueView value={entry.data.steps} field={STEPS} />)

    expect(screen.getByText("1/2")).toBeInTheDocument()
    expect(screen.queryByText(/object Object/)).toBeNull()
  })

  it("names a linked project rather than showing its id", () => {
    const field = { id: "for", name: "Done for", type: "project_reference" }
    render(<ValueView value="p2" field={field} projects={[{ id: "p2", name: "Lab Book" }]} />)

    expect(screen.getByText("Lab Book")).toBeInTheDocument()
    expect(screen.queryByText("p2")).toBeNull()
  })

  it("says so plainly when a link points at something gone", () => {
    const field = { id: "for", name: "Done for", type: "project_reference" }
    render(<ValueView value="p-gone" field={field} projects={[]} />)

    expect(screen.getByText("A project you no longer have")).toBeInTheDocument()
  })

  it("names a linked entry by its own first field", () => {
    const field = { id: "follows", name: "Follows on from", type: "link" }
    render(<ValueView value="e1" field={field} entries={[entry]} />)

    expect(screen.getByText("Reran the calibration")).toBeInTheDocument()
  })

  it("distinguishes a value nobody recorded from one recorded as empty", () => {
    const { rerender } = render(<ValueView value={NOT_RECORDED} field={HOURS} />)
    expect(screen.getByText("not recorded")).toBeInTheDocument()

    rerender(<ValueView value="" field={NOTE} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("agrees with its own plain-text rendering", () => {
    // Both are used — one on screen, one for copying and searching — so a
    // disagreement between them would be a bug nobody could see.
    expect(valueToText(["reading", "draft"], TAGS)).toBe("reading, draft")
    expect(valueToText(entry.data.steps, STEPS)).toBe("1/2 · Outline, Draft")
  })
})

describe("naming an entry", () => {
  it("uses the first field with something readable in it", () => {
    expect(entrySummary(entry, project.entry_schema)).toBe("Reran the calibration")
  })

  it("skips fields that would name it after a calculation or a link", () => {
    const computed = { id: "total", name: "Total", type: "computed", expression: "{hours}" }
    const sparse = {
      ...entry,
      data: { total: 12, hours: 4 },
      schema_snapshot: [computed, HOURS],
    }

    expect(entrySummary(sparse, [computed, HOURS])).toBe("4")
  })

  it("falls back rather than showing nothing", () => {
    expect(entrySummary({ data: {} }, [])).toBe("Untitled entry")
  })
})

describe("showing entries written under different formats", () => {
  const older = {
    id: "e0",
    project_id: "p1",
    // Written when the project asked for Note, Hours and Mood, and when Hours
    // was text. None of that has been rewritten.
    data: { note: "Site visit", hours: "2", mood: "Tired" },
    schema_snapshot: [NOTE, { ...HOURS, type: "text" }, MOOD],
    created_at: "2026-06-01T10:00:00Z",
  }

  it("keeps a column for a field the project no longer asks for", () => {
    const columns = columnsFor(project, [entry, older])

    const mood = columns.find((column) => column.id === "mood")
    expect(mood).toBeTruthy()
    expect(mood.name).toBe("Mood")
    expect(mood.retired).toBe(true)
  })

  it("puts the project's current fields first", () => {
    const columns = columnsFor(project, [entry, older])

    expect(columns.slice(0, 4).map((column) => column.id)).toEqual([
      "note",
      "hours",
      "tags",
      "steps",
    ])
  })

  it("reads an entry against the format it was written under", () => {
    expect(schemaForEntry(older, project).map((field) => field.type)).toEqual([
      "text",
      "text",
      "text",
    ])
  })

  it("marks a value recorded under an earlier version of its field", () => {
    const cell = cellFor(older, HOURS, project)

    expect(cell.value).toBe("2")
    expect(cell.state).toBe("earlier")
  })

  it("reports a field the entry predates as unrecorded, not as blank", () => {
    const cell = cellFor(older, TAGS, project)

    expect(cell.value).toBe(NOT_RECORDED)
    expect(cell.state).toBe("missing")
  })

  it("reads an entry written under the current format as current", () => {
    expect(cellFor(entry, HOURS, project).state).toBe("current")
  })
})

describe("telling two formats apart", () => {
  it("ignores optional keys the API fills in and a snapshot omits", () => {
    // The API returns `options: null` and `expression: null` on every field;
    // a stored snapshot carries only the keys it was saved with. Comparing the
    // two by stringifying reported every entry as written under an older
    // format, which put an "earlier format" badge on the whole logbook.
    const fromApi = [
      { id: "note", name: "Note", type: "text", options: null, expression: null, linked_project_id: null },
    ]
    const fromSnapshot = [{ id: "note", name: "Note", type: "text" }]

    expect(sameFormat(fromApi, fromSnapshot)).toBe(true)
  })

  it("notices a renamed field", () => {
    expect(sameFormat([NOTE], [{ ...NOTE, name: "Observation" }])).toBe(false)
  })

  it("notices a retyped field", () => {
    expect(sameFormat([HOURS], [{ ...HOURS, type: "text" }])).toBe(false)
  })

  it("notices a withdrawn choice", () => {
    const before = { id: "s", name: "Stage", type: "dropdown", options: ["A", "B"] }
    expect(sameFormat([before], [{ ...before, options: ["A"] }])).toBe(false)
  })

  it("notices a field that has come or gone", () => {
    expect(sameFormat([NOTE, HOURS], [NOTE])).toBe(false)
  })
})
