import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SavedFilterBar } from "./SavedFilterBar"
import { EntriesPage } from "./WorkspacePages"
import {
  deleteSavedFilter,
  fetchEntriesGlobal,
  fetchSavedFilters,
  fetchTasks,
  saveFilter,
} from "./api"

vi.mock("./api", () => ({
  deleteSavedFilter: vi.fn(),
  fetchEntriesGlobal: vi.fn(),
  fetchSavedFilters: vi.fn(),
  fetchTasks: vi.fn(),
  saveFilter: vi.fn(),
}))

const projects = [
  { id: "p1", name: "Operations", archived: false },
  { id: "p2", name: "Research", archived: false },
]

const savedFilter = {
  id: "filter-1",
  name: "Overdue research",
  criteria: { q: "prototype", project_id: "p2", todo: true, sort: "due_date" },
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchEntriesGlobal.mockResolvedValue([])
  fetchSavedFilters.mockResolvedValue([])
  fetchTasks.mockResolvedValue([])
})

describe("SavedFilterBar", () => {
  it("saves the current criteria under a name", async () => {
    saveFilter.mockResolvedValue(savedFilter)
    const criteria = { q: "prototype", project_id: "p2", todo: true, sort: "due_date" }

    render(<SavedFilterBar criteria={criteria} onApply={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Save these filters as/), {
      target: { value: "  Overdue research  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }))

    // The name is trimmed before it is sent, so a stray space cannot create a
    // second filter that looks identical in the list.
    await waitFor(() =>
      expect(saveFilter).toHaveBeenCalledWith("Overdue research", criteria),
    )
    expect(await screen.findByRole("button", { name: "Overdue research" })).toBeInTheDocument()
  })

  it("cannot be submitted without a name", () => {
    render(<SavedFilterBar criteria={{}} onApply={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Save filter" })).toBeDisabled()
  })

  it("re-saving a name replaces that filter instead of duplicating it", async () => {
    fetchSavedFilters.mockResolvedValue([savedFilter])
    saveFilter.mockResolvedValue({ ...savedFilter, criteria: { q: "later" } })

    render(<SavedFilterBar criteria={{ q: "later" }} onApply={vi.fn()} />)
    await screen.findByRole("button", { name: "Overdue research" })

    fireEvent.change(screen.getByLabelText(/Save these filters as/), {
      target: { value: "Overdue research" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }))

    await waitFor(() => expect(saveFilter).toHaveBeenCalled())
    expect(screen.getAllByRole("button", { name: "Overdue research" })).toHaveLength(1)
  })

  it("hands the stored criteria back when a filter is applied", async () => {
    fetchSavedFilters.mockResolvedValue([savedFilter])
    const onApply = vi.fn()

    render(<SavedFilterBar criteria={{}} onApply={onApply} />)

    fireEvent.click(await screen.findByRole("button", { name: "Overdue research" }))

    expect(onApply).toHaveBeenCalledWith(savedFilter.criteria)
  })

  it("removes a filter from the list once deleted", async () => {
    fetchSavedFilters.mockResolvedValue([savedFilter])
    deleteSavedFilter.mockResolvedValue(null)

    render(<SavedFilterBar criteria={{}} onApply={vi.fn()} />)

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete saved filter Overdue research" }),
    )

    await waitFor(() => expect(deleteSavedFilter).toHaveBeenCalledWith("filter-1"))
    expect(screen.queryByRole("button", { name: "Overdue research" })).not.toBeInTheDocument()
  })

  it("reports a failure to save", async () => {
    saveFilter.mockRejectedValue(new Error("Filter name cannot be blank."))

    render(<SavedFilterBar criteria={{}} onApply={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Save these filters as/), {
      target: { value: "Broken" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Filter name cannot be blank.")
  })
})

describe("EntriesPage saved filters", () => {
  it("re-applying a saved filter restores every control and re-runs the search", async () => {
    fetchSavedFilters.mockResolvedValue([savedFilter])

    render(<EntriesPage projects={projects} onCreate={vi.fn()} />)

    fireEvent.click(await screen.findByRole("button", { name: "Overdue research" }))

    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith({
        q: "prototype",
        projectId: "p2",
        todo: true,
        sort: "due_date",
        page: 1,
        pageSize: 30,
      }),
    )
    expect(screen.getByLabelText(/Search entries/)).toHaveValue("prototype")
    expect(screen.getByLabelText(/Project/)).toHaveValue("p2")
    expect(screen.getByLabelText(/Status/)).toHaveValue("true")
    expect(screen.getByLabelText(/Sort/)).toHaveValue("due_date")
  })

  it("offers the current filters to be saved", async () => {
    render(<EntriesPage projects={projects} onCreate={vi.fn()} />)
    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "true" } })
    fireEvent.change(screen.getByLabelText(/Sort/), { target: { value: "due_date" } })
    fireEvent.change(screen.getByLabelText(/Save these filters as/), {
      target: { value: "My outstanding work" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save filter" }))

    await waitFor(() =>
      expect(saveFilter).toHaveBeenCalledWith("My outstanding work", {
        q: null,
        project_id: null,
        todo: true,
        sort: "due_date",
      }),
    )
  })

  it("narrows the search to completed work without dropping the filter", async () => {
    render(<EntriesPage projects={projects} onCreate={vi.fn()} />)
    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "false" } })

    await waitFor(() =>
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith(
        expect.objectContaining({ todo: false }),
      ),
    )
  })
})
