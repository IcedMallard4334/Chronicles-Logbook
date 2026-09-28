import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"
import {
  fetchDashboard,
  updateDashboardPanels,
  fetchSavedFilters,
  fetchEntries,
  fetchEntriesGlobal,
  fetchStatistics,
  fetchFieldTimeline,
} from "./api"

vi.mock("./api", () => ({
  fetchDashboard: vi.fn(),
  updateDashboardPanels: vi.fn(),
  fetchSavedFilters: vi.fn(),
  fetchEntries: vi.fn(),
  fetchEntriesGlobal: vi.fn(),
  fetchStatistics: vi.fn(),
  fetchFieldTimeline: vi.fn(),
}))

const projects = [
  {
    id: "p1",
    name: "Operations",
    entry_schema: [{ id: "status-field", name: "Status", type: "dropdown", options: ["Open", "Closed"] }],
  },
]

const statisticPanel = {
  id: "panel-1",
  type: "statistic",
  title: null,
  config: { view: "overview" },
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchSavedFilters.mockResolvedValue([])
  fetchStatistics.mockResolvedValue({
    totals: { projects: 1, active_projects: 1, archived_projects: 0, entries: 4, time_spent: 120, active_days: 2 },
    projects: [{ project_id: "p1", name: "Operations", archived: false, entries: 4, time_spent: 120, active_days: 2, first_entry_at: null, last_entry_at: null }],
  })
  fetchEntries.mockResolvedValue([])
  fetchEntriesGlobal.mockResolvedValue([])
  fetchFieldTimeline.mockResolvedValue({ project_id: "p1", field_id: "f1", field_name: "Field", field_type: "number", points: [] })
})

describe("DashboardPage", () => {
  it("renders a saved panel's statistic", async () => {
    fetchDashboard.mockResolvedValue({ panels: [statisticPanel], updated_at: "2026-09-24T00:00:00Z" })

    render(<DashboardPage projects={projects} />)

    await waitFor(() => expect(screen.getByText("4")).toBeInTheDocument())
    expect(screen.getByText("Entries")).toBeInTheDocument()
  })

  it("shows an empty state with no panels", async () => {
    fetchDashboard.mockResolvedValue({ panels: [], updated_at: "2026-09-24T00:00:00Z" })

    render(<DashboardPage projects={projects} />)

    await waitFor(() =>
      expect(screen.getByText(/Your dashboard is empty/)).toBeInTheDocument()
    )
  })

  it("adds a panel and persists the new layout", async () => {
    fetchDashboard.mockResolvedValue({ panels: [], updated_at: "2026-09-24T00:00:00Z" })
    updateDashboardPanels.mockResolvedValue({
      panels: [{ id: "new-panel", type: "statistic", title: null, config: { view: "overview" } }],
      updated_at: "2026-09-24T00:01:00Z",
    })

    render(<DashboardPage projects={projects} />)
    await waitFor(() => expect(screen.getByText(/Your dashboard is empty/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "+ Add panel" }))
    fireEvent.click(screen.getByRole("button", { name: "Add panel" }))

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(1))
    const [savedPanels] = updateDashboardPanels.mock.calls[0]
    expect(savedPanels).toHaveLength(1)
    expect(savedPanels[0]).toMatchObject({ type: "statistic", config: { view: "overview" } })
  })

  it("removes a panel and persists the new layout", async () => {
    fetchDashboard.mockResolvedValue({ panels: [statisticPanel], updated_at: "2026-09-24T00:00:00Z" })
    updateDashboardPanels.mockResolvedValue({ panels: [], updated_at: "2026-09-24T00:01:00Z" })

    render(<DashboardPage projects={projects} />)
    await waitFor(() => expect(screen.getByText("Entries")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }))

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledWith([]))
  })

  it("moves a panel and persists the new order", async () => {
    const second = { id: "panel-2", type: "statistic", title: null, config: { view: "project_breakdown" } }
    fetchDashboard.mockResolvedValue({ panels: [statisticPanel, second], updated_at: "2026-09-24T00:00:00Z" })
    updateDashboardPanels.mockResolvedValue({ panels: [second, statisticPanel], updated_at: "2026-09-24T00:01:00Z" })

    render(<DashboardPage projects={projects} />)
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Move panel down" })).toHaveLength(2))

    fireEvent.click(screen.getAllByRole("button", { name: "Move panel down" })[0])

    await waitFor(() =>
      expect(updateDashboardPanels).toHaveBeenCalledWith([second, statisticPanel])
    )
  })

  it("renders a board panel's status counts", async () => {
    const boardPanel = { id: "panel-1", type: "board", title: null, config: { project_id: "p1", grouping: "__status__" } }
    fetchDashboard.mockResolvedValue({ panels: [boardPanel], updated_at: "2026-09-24T00:00:00Z" })
    fetchEntries.mockResolvedValue([
      { id: "e1", todo: true, data: {} },
      { id: "e2", todo: false, data: {} },
      { id: "e3", todo: false, data: {} },
    ])

    render(<DashboardPage projects={projects} />)

    await waitFor(() => expect(screen.getByText("Still to do")).toBeInTheDocument())
    expect(fetchEntries).toHaveBeenCalledWith("p1")
  })
})
