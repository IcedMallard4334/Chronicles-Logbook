import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BoardView from "./BoardView"
import { fetchEntries, updateEntry } from "./api"

vi.mock("./api", () => ({
  fetchEntries: vi.fn(),
  updateEntry: vi.fn(),
}))

const STATUS_FIELD = { id: "field-2", name: "Stage", type: "dropdown", options: ["Open", "Blocked", "Shipped"] }

const projects = [
  {
    id: "p1",
    name: "Operations",
    archived: false,
    entry_schema: [{ id: "field-1", name: "Note", type: "text" }, STATUS_FIELD],
  },
  { id: "p2", name: "Research", archived: false, entry_schema: [] },
]

const entry = (id, overrides = {}) => ({
  id,
  project_id: "p1",
  data: { "field-1": `Note ${id}`, "field-2": "Open" },
  todo: false,
  due_date: null,
  created_at: "2026-09-01T08:00:00Z",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  fetchEntries.mockResolvedValue([])
})

// A card shows every field value joined together, so it is matched loosely on
// the one value the test cares about.
const cardShowing = (value) => screen.getByText(new RegExp(value)).closest("li")

describe("BoardView", () => {
  it("groups entries by whether they are still outstanding", async () => {
    fetchEntries.mockResolvedValue([
      entry("e1", { todo: true }),
      entry("e2"),
      entry("e3", { todo: true }),
    ])

    render(<BoardView projects={projects} />)

    // The counts live in the column labels, so a reader using a screen reader
    // hears how much work sits in each pile.
    expect(await screen.findByRole("region", { name: "Still to do (2)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Done (1)" })).toBeInTheDocument()
  })

  it("offers each dropdown field as a grouping and builds a column per option", async () => {
    fetchEntries.mockResolvedValue([entry("e1", { data: { "field-1": "Note e1", "field-2": "Blocked" } })])

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Done (1)" })

    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "field-2" } })

    expect(await screen.findByRole("region", { name: "Blocked (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Open (0)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Shipped (0)" })).toBeInTheDocument()
  })

  it("saves the new column when a card is dropped", async () => {
    fetchEntries.mockResolvedValue([entry("e1", { todo: true })])
    updateEntry.mockResolvedValue(entry("e1", { todo: false }))

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Still to do (1)" })

    const card = cardShowing("Note e1")
    fireEvent.dragStart(card)
    const done = screen.getByRole("region", { name: "Done (0)" })
    fireEvent.dragOver(done)
    fireEvent.drop(done)

    await waitFor(() => expect(updateEntry).toHaveBeenCalledWith("p1", "e1", { todo: false }))
    expect(await screen.findByRole("region", { name: "Done (1)" })).toBeInTheDocument()
  })

  it("sends the whole data map when a dropdown grouping changes", async () => {
    const original = entry("e1")
    fetchEntries.mockResolvedValue([original])
    updateEntry.mockResolvedValue({ ...original, data: { ...original.data, "field-2": "Shipped" } })

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Done (1)" })
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "field-2" } })
    await screen.findByRole("region", { name: "Open (1)" })

    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "Shipped" } })

    // Every field in a project's schema is required, so a partial data map
    // would come back from the server as an incomplete entry.
    await waitFor(() =>
      expect(updateEntry).toHaveBeenCalledWith("p1", "e1", {
        data: { "field-1": "Note e1", "field-2": "Shipped" },
      }),
    )
  })

  it("puts the card back and explains itself when the move is refused", async () => {
    fetchEntries.mockResolvedValue([entry("e1", { todo: true })])
    updateEntry.mockRejectedValue(new Error("Entry could not be updated"))

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Still to do (1)" })

    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "done" } })

    expect(await screen.findByRole("alert")).toHaveTextContent("Entry could not be updated")
    expect(screen.getByRole("region", { name: "Still to do (1)" })).toBeInTheDocument()
  })

  it("ignores a drop onto the column a card already sits in", async () => {
    fetchEntries.mockResolvedValue([entry("e1", { todo: true })])

    render(<BoardView projects={projects} />)
    const column = await screen.findByRole("region", { name: "Still to do (1)" })

    fireEvent.dragStart(cardShowing("Note e1"))
    fireEvent.drop(column)

    await waitFor(() => expect(updateEntry).not.toHaveBeenCalled())
  })

  it("collects entries holding a retired dropdown value in a column nobody can drop into", async () => {
    fetchEntries.mockResolvedValue([entry("e1", { data: { "field-1": "Note e1", "field-2": "Retired" } })])

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Done (1)" })
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "field-2" } })

    const unsorted = await screen.findByRole("region", { name: "Unsorted (1)" })
    fireEvent.dragStart(cardShowing("Retired"))
    fireEvent.drop(unsorted)

    expect(updateEntry).not.toHaveBeenCalled()
    // There is no value that would return an entry here, so the option cannot
    // be picked from the keyboard route either.
    expect(screen.getByRole("option", { name: "Unsorted" })).toBeDisabled()
  })

  it("reloads and falls back to status when a project without dropdowns is chosen", async () => {
    fetchEntries.mockResolvedValue([entry("e1")])

    render(<BoardView projects={projects} />)
    await screen.findByRole("region", { name: "Done (1)" })
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "field-2" } })
    await screen.findByRole("region", { name: "Open (1)" })

    fetchEntries.mockResolvedValue([])
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } })

    await waitFor(() => expect(fetchEntries).toHaveBeenLastCalledWith("p2"))
    expect(await screen.findByRole("region", { name: "Still to do (0)" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /Open/ })).not.toBeInTheDocument()
  })

  it("invites the reader to create a project when there are none", () => {
    render(<BoardView projects={[]} />)

    expect(screen.getByText("Nothing to arrange yet")).toBeInTheDocument()
    expect(fetchEntries).not.toHaveBeenCalled()
  })

  it("reports a board that could not be loaded", async () => {
    fetchEntries.mockRejectedValue(new Error("Entries are unavailable"))

    render(<BoardView projects={projects} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Entries are unavailable")
  })
})
