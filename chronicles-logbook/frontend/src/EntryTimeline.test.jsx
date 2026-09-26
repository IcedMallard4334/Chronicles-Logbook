import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchEntriesGlobal } from "./api"
import EntryTimeline from "./EntryTimeline"

vi.mock("./api", () => ({ fetchEntriesGlobal: vi.fn() }))

const projects = [{ id: "project-1", name: "Field Notes" }]
const entry = (id, createdAt, note = id) => ({
  id,
  project_id: "project-1",
  project_name: "Field Notes",
  title: null,
  data: { notes: note, hours: 3 },
  schema_snapshot: [
    { id: "notes", name: "Notes", type: "text" },
    { id: "hours", name: "Hours", type: "number" },
  ],
  created_at: createdAt,
})

describe("EntryTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchEntriesGlobal.mockResolvedValue([])
  })

  it("renders chronological entries with project, time and dynamic fields", async () => {
    fetchEntriesGlobal.mockResolvedValueOnce([
      entry("new", "2026-09-20T14:30:00Z", "Newest note"),
      entry("old", "2026-09-10T08:00:00Z", "Older note"),
    ])

    render(<EntryTimeline projects={projects} onShowFieldTrends={vi.fn()} />)

    const timeline = await screen.findByRole("list")
    const items = within(timeline).getAllByRole("listitem")
    expect(within(items[0]).getByText("Newest note")).toBeInTheDocument()
    expect(within(items[1]).getByText("Older note")).toBeInTheDocument()
    expect(within(items[0]).getByText("Field Notes")).toBeInTheDocument()
    expect(within(items[0]).getByText("Notes")).toBeInTheDocument()
    expect(within(items[0]).getByText("Hours")).toBeInTheDocument()
    expect(within(items[0]).getByRole("time")).toHaveAttribute(
      "datetime",
      "2026-09-20T14:30:00Z",
    )
  })

  it("pages through a large history", async () => {
    fetchEntriesGlobal
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => (
        entry(`entry-${index}`, `2026-09-${String(20 - index).padStart(2, "0")}T08:00:00Z`)
      )))
      .mockResolvedValueOnce([entry("page-two", "2026-08-31T08:00:00Z")])

    render(<EntryTimeline projects={projects} onShowFieldTrends={vi.fn()} />)

    await screen.findByText("entry-0")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByText("page-two")).toBeInTheDocument()
    expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2,
      pageSize: 20,
    }))
    expect(screen.getByText("Page 2")).toBeInTheDocument()
  })

  it("sends date filters and resets pagination when a filter changes", async () => {
    fetchEntriesGlobal.mockResolvedValue(Array.from({ length: 20 }, (_, index) => (
      entry(`entry-${index}`, "2026-09-20T08:00:00Z")
    )))

    render(<EntryTimeline projects={projects} onShowFieldTrends={vi.fn()} />)
    await screen.findByText("entry-0")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-01" } })
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-09-30" } })

    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        start: "2026-09-01T00:00:00",
        end: "2026-09-30T23:59:59.999",
      }),
    ))
    expect(screen.getByText("Page 1")).toBeInTheDocument()
  })

  it("handles empty results and API errors", async () => {
    const { rerender } = render(
      <EntryTimeline key="empty" projects={projects} onShowFieldTrends={vi.fn()} />,
    )
    expect(await screen.findByRole("heading", { name: "Your timeline is empty" })).toBeInTheDocument()

    fetchEntriesGlobal.mockRejectedValueOnce(new Error("Timeline unavailable"))
    rerender(<EntryTimeline key="error" projects={projects} onShowFieldTrends={vi.fn()} />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Timeline unavailable")
  })
})
