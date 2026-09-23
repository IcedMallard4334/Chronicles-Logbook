import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import OutstandingPage from "./OutstandingPage"
import { fetchEntriesGlobal, updateEntry } from "./api"

vi.mock("./api", () => ({
  fetchEntriesGlobal: vi.fn(),
  updateEntry: vi.fn(),
}))

const projects = [
  { id: "p1", name: "Operations", archived: false },
  { id: "p2", name: "Research", archived: false },
]

// Dates are built relative to the clock so the buckets stay correct however
// long this suite lives in the repository.
const isoDaysFromToday = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const entry = (id, overrides = {}) => ({
  id,
  project_id: "p1",
  project_name: "Operations",
  data: { "field-1": `Note ${id}` },
  todo: true,
  due_date: null,
  time_spent: null,
  created_at: "2026-09-01T08:00:00Z",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  fetchEntriesGlobal.mockResolvedValue([])
})

describe("OutstandingPage", () => {
  it("asks the server for outstanding work ordered by due date", async () => {
    render(<OutstandingPage projects={projects} />)

    // The ordering is left to the server so it holds over the whole list and
    // not just the rows already in the browser.
    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenCalledWith({
        todo: true,
        sort: "due_date",
        projectId: undefined,
        page: 1,
        pageSize: 100,
      }),
    )
  })

  it("sorts work into buckets by how soon it is due", async () => {
    fetchEntriesGlobal.mockResolvedValue([
      entry("late", { due_date: isoDaysFromToday(-3) }),
      entry("now", { due_date: isoDaysFromToday(0) }),
      entry("soon", { due_date: isoDaysFromToday(4) }),
      entry("far", { due_date: isoDaysFromToday(40) }),
      entry("none"),
    ])

    render(<OutstandingPage projects={projects} />)

    expect(await screen.findByRole("region", { name: "Overdue (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Due today (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Next 7 days (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Later (1)" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "No due date (1)" })).toBeInTheDocument()
  })

  it("leaves out buckets that hold nothing", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1", { due_date: isoDaysFromToday(0) })])

    render(<OutstandingPage projects={projects} />)

    await screen.findByRole("region", { name: "Due today (1)" })
    expect(screen.queryByRole("region", { name: /Overdue/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /No due date/ })).not.toBeInTheDocument()
  })

  it("counts the overdue items in the heading", async () => {
    fetchEntriesGlobal.mockResolvedValue([
      entry("e1", { due_date: isoDaysFromToday(-1) }),
      entry("e2", { due_date: isoDaysFromToday(-9) }),
      entry("e3", { due_date: isoDaysFromToday(2) }),
    ])

    render(<OutstandingPage projects={projects} />)

    expect(await screen.findByText("2 overdue")).toBeInTheDocument()
  })

  it("describes near deadlines in words rather than dates", async () => {
    fetchEntriesGlobal.mockResolvedValue([
      entry("e1", { due_date: isoDaysFromToday(0) }),
      entry("e2", { due_date: isoDaysFromToday(1) }),
      entry("e3", { due_date: isoDaysFromToday(-1) }),
    ])

    render(<OutstandingPage projects={projects} />)

    expect(await screen.findByText("Today")).toBeInTheDocument()
    expect(screen.getByText("Tomorrow")).toBeInTheDocument()
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
  })

  it("narrows the list to one project", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1")])

    render(<OutstandingPage projects={projects} />)
    await screen.findByRole("region", { name: "No due date (1)" })

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } })

    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
        expect.objectContaining({ projectId: "p2", todo: true, sort: "due_date" }),
      ),
    )
  })

  it("drops an item from the list once it is marked done", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1"), entry("e2")])
    updateEntry.mockResolvedValue(entry("e1", { todo: false }))

    render(<OutstandingPage projects={projects} />)
    await screen.findByRole("region", { name: "No due date (2)" })

    fireEvent.click(screen.getAllByRole("button", { name: "Mark done" })[0])

    await waitFor(() => expect(updateEntry).toHaveBeenCalledWith("p1", "e1", { todo: false }))
    // Finished work has no place in a view of what is still outstanding.
    expect(await screen.findByRole("region", { name: "No due date (1)" })).toBeInTheDocument()
    expect(screen.getByText(/1 item still open/)).toBeInTheDocument()
  })

  it("keeps the item and explains itself when marking done fails", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1")])
    updateEntry.mockRejectedValue(new Error("Entry could not be updated"))

    render(<OutstandingPage projects={projects} />)
    await screen.findByRole("region", { name: "No due date (1)" })

    fireEvent.click(screen.getByRole("button", { name: "Mark done" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Entry could not be updated")
  })

  it("celebrates an empty list and points the way back to entries", async () => {
    const onNavigate = vi.fn()

    render(<OutstandingPage projects={projects} onNavigate={onNavigate} />)

    expect(await screen.findByText("Nothing outstanding")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Go to entries" }))
    expect(onNavigate).toHaveBeenCalledWith("entries")
  })

  it("offers a retry when the list cannot be loaded", async () => {
    fetchEntriesGlobal.mockRejectedValueOnce(new Error("Entries are unavailable"))
    fetchEntriesGlobal.mockResolvedValue([entry("e1")])

    render(<OutstandingPage projects={projects} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Entries are unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByRole("region", { name: "No due date (1)" })).toBeInTheDocument()
  })
})
