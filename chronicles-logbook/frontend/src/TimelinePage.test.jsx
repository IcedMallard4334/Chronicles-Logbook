/**
 * The record, end to end.
 *
 * What was under the "Activity" tab was a form for plotting one field against
 * a date range — a statistics tool wearing the name of a record, which is why
 * nobody could tell what the tab was for. This is the browsable history the
 * brief puts first, and what is tested is that it reads as one: grouped by
 * day, searchable, narrowable to a project, and openable.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({ fetchEntriesGlobal: vi.fn() }))

import TimelinePage from "./TimelinePage"
import { fetchEntriesGlobal } from "./api"

const NOTE = { id: "note", name: "What I did", type: "text" }
const HOURS = { id: "hours", name: "Hours", type: "number" }
const TAGS = { id: "tags", name: "Topics", type: "tags" }

const thesis = {
  id: "p1",
  name: "Thesis",
  entry_schema: [NOTE, HOURS, TAGS],
  retired_schema: [],
}
const lab = { id: "p2", name: "Lab Book", entry_schema: [NOTE], retired_schema: [] }

function entry(id, overrides = {}) {
  return {
    id,
    project_id: "p1",
    project_name: "Thesis",
    data: { note: `Entry ${id}`, hours: 2, tags: ["reading"] },
    schema_snapshot: [NOTE, HOURS, TAGS],
    time_spent: 120,
    todo: false,
    due_date: null,
    created_at: "2026-09-12T10:00:00Z",
    ...overrides,
  }
}

function open(props = {}) {
  const handlers = {
    onOpenEntry: vi.fn(),
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    ...props,
  }
  render(<TimelinePage projects={[thesis, lab]} {...handlers} />)
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
  // IntersectionObserver drives the infinite scroll and jsdom has none.
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  }
  fetchEntriesGlobal.mockResolvedValue([
    entry("e1"),
    entry("e2", { created_at: "2026-09-12T15:00:00Z" }),
    entry("e3", {
      created_at: "2026-09-08T09:00:00Z",
      project_id: "p2",
      project_name: "Lab Book",
      data: { note: "Sample held steady" },
      schema_snapshot: [NOTE],
      time_spent: 30,
    }),
  ])
})

describe("browsing the record", () => {
  it("groups entries by the day they were written", async () => {
    open()

    await screen.findByText("Entry e1")
    // The page itself is a region too, so days are picked out by their own
    // labels rather than by counting every region on screen.
    const days = screen
      .getAllByRole("region")
      .filter((region) => region.classList.contains("tl-day"))

    expect(days).toHaveLength(2)
    expect(within(days[0]).getAllByRole("listitem")).toHaveLength(2)
    expect(within(days[1]).getAllByRole("listitem")).toHaveLength(1)
  })

  it("says how much was written on each day", async () => {
    open()

    expect(await screen.findByText("2 entries · 4h")).toBeInTheDocument()
  })

  it("shows each entry under its own title rather than a mash of values", async () => {
    open()

    await screen.findByText("Entry e1")
    // The field that produced the title is not printed again underneath it.
    expect(screen.queryByText("WHAT I DID")).toBeNull()
    expect(screen.getAllByText("Hours").length).toBeGreaterThan(0)
  })

  it("renders a tag as a tag", async () => {
    open()

    expect((await screen.findAllByText("reading"))[0]).toBeInTheDocument()
  })

  it("opens an entry when its card is clicked", async () => {
    const handlers = open()

    fireEvent.click((await screen.findAllByRole("button", { name: /Open entry from Thesis/ }))[0])

    expect(handlers.onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }))
  })
})

describe("narrowing the record", () => {
  it("searches across everything written", async () => {
    open()
    await screen.findByText("Entry e1")

    fireEvent.change(screen.getByPlaceholderText(/Search everything/), {
      target: { value: "calibration" },
    })

    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "calibration" })
      )
    )
  })

  it("narrows to a single project", async () => {
    open()
    await screen.findByText("Entry e1")

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } })

    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
        expect.objectContaining({ projectId: "p2" })
      )
    )
  })

  it("offers a way back when a search finds nothing", async () => {
    fetchEntriesGlobal.mockResolvedValue([])
    open()

    expect(await screen.findByText("Your record starts here")).toBeInTheDocument()
  })

  it("says so rather than showing an empty record when the request fails", async () => {
    fetchEntriesGlobal.mockRejectedValue(new Error("Cannot reach the Chronicles API."))
    open()

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach")
  })
})
