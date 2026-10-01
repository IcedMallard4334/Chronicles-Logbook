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
  fetchAchievements,
} from "./api"

vi.mock("./api", () => ({
  fetchDashboard: vi.fn(),
  updateDashboardPanels: vi.fn(),
  fetchSavedFilters: vi.fn(),
  fetchEntries: vi.fn(),
  fetchEntriesGlobal: vi.fn(),
  fetchStatistics: vi.fn(),
  fetchFieldTimeline: vi.fn(),
  fetchAchievements: vi.fn(),
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

    await waitFor(() => expect(screen.getByText("4", { selector: "strong" })).toBeInTheDocument())
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

describe("DashboardPage grid", () => {
  const second = { id: "panel-2", type: "statistic", title: null, config: { view: "project_breakdown" }, w: 1, h: 2 }
  const first = { ...statisticPanel, w: 2, h: 1 }

  function load(panels = [first, second], columns = 3) {
    fetchDashboard.mockResolvedValue({ panels, columns, updated_at: "2026-09-24T00:00:00Z" })
    updateDashboardPanels.mockImplementation(async (next, cols) => ({ panels: next, columns: cols ?? columns, updated_at: "2026-09-24T00:01:00Z" }))
    return render(<DashboardPage projects={projects} />)
  }

  it("lays panels out on a grid of the chosen width, each spanning the room it was given", async () => {
    const { container } = load()
    await screen.findAllByRole("button", { name: "Remove panel" })

    const grid = container.querySelector(".dashboard-panel-grid")
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))")
    const [a, b] = container.querySelectorAll(".dashboard-panel")
    expect([a.style.gridColumn, a.style.gridRow]).toEqual(["span 2", "span 1"])
    expect([b.style.gridColumn, b.style.gridRow]).toEqual(["span 1", "span 2"])
  })

  it("changes how many blocks wide the grid is, and narrows panels that no longer fit", async () => {
    load([{ ...first, w: 3 }, second], 4)
    await screen.findAllByRole("button", { name: "Remove panel" })

    fireEvent.change(screen.getByLabelText("Blocks across"), { target: { value: "2" } })

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(1))
    const [saved, columns] = updateDashboardPanels.mock.calls[0]
    expect(columns).toBe(2)
    expect(saved.map((panel) => panel.w)).toEqual([2, 1])
  })

  it("resizes a single panel's width and height", async () => {
    load()
    const widths = await screen.findAllByLabelText("Panel width")

    fireEvent.change(widths[1], { target: { value: "3" } })
    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(1))
    expect(updateDashboardPanels.mock.calls[0][0].map((panel) => panel.w)).toEqual([2, 3])

    fireEvent.change((await screen.findAllByLabelText("Panel height"))[0], { target: { value: "4" } })
    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(2))
    expect(updateDashboardPanels.mock.calls[1][0].map((panel) => panel.h)).toEqual([4, 2])
  })

  it("only offers widths that fit the grid", async () => {
    load([first, second], 2)
    const [width] = await screen.findAllByLabelText("Panel width")

    expect([...width.options].map((option) => option.value)).toEqual(["1", "2"])
  })

  function pointerAt(panel) {
    // jsdom has no layout, so "what is under the pointer" is stubbed.
    document.elementFromPoint = vi.fn(() => panel.querySelector(".dashboard-panel-body"))
  }

  it("rearranges panels by dragging the grip of one onto another, with a mouse or a finger", async () => {
    const { container } = load()
    await screen.findAllByRole("button", { name: "Remove panel" })
    const [a, b] = container.querySelectorAll(".dashboard-panel")
    const grip = b.querySelector(".dashboard-panel-grip")

    fireEvent.pointerDown(grip, { pointerId: 1, pointerType: "touch" })
    expect(b).toHaveClass("is-dragging")
    pointerAt(a)
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })
    expect(a).toHaveClass("is-drop-target")
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(1))
    expect(updateDashboardPanels.mock.calls[0][0].map((panel) => panel.id)).toEqual(["panel-2", "panel-1"])
  })

  it("does nothing when a panel is dropped on itself or outside every panel", async () => {
    const { container } = load()
    await screen.findAllByRole("button", { name: "Remove panel" })
    const [a] = container.querySelectorAll(".dashboard-panel")
    const grip = a.querySelector(".dashboard-panel-grip")

    fireEvent.pointerDown(grip, { pointerId: 1 })
    pointerAt(a)
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1 })

    fireEvent.pointerDown(grip, { pointerId: 1 })
    document.elementFromPoint = vi.fn(() => null)
    fireEvent.pointerMove(window, { clientX: 1, clientY: 1 })
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1 })

    expect(updateDashboardPanels).not.toHaveBeenCalled()
    expect(a).not.toHaveClass("is-dragging")
  })

  it("abandons a drag that the browser cancels", async () => {
    const { container } = load()
    await screen.findAllByRole("button", { name: "Remove panel" })
    const [a, b] = container.querySelectorAll(".dashboard-panel")

    fireEvent.pointerDown(b.querySelector(".dashboard-panel-grip"), { pointerId: 1 })
    pointerAt(a)
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 })
    fireEvent.pointerCancel(window)

    expect(updateDashboardPanels).not.toHaveBeenCalled()
    expect(b).not.toHaveClass("is-dragging")
  })

  it("lets a new panel be given its size when it is added", async () => {
    load([])
    await screen.findByText(/Your dashboard is empty/)
    fireEvent.click(screen.getByRole("button", { name: "+ Add panel" }))

    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Add panel" }))

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalledTimes(1))
    expect(updateDashboardPanels.mock.calls[0][0][0]).toMatchObject({ w: 3, h: 3 })
  })
})

describe("projects and badges panels", () => {
  it("shows the projects and their figures", async () => {
    fetchDashboard.mockResolvedValue({ panels: [{ id: "pp", type: "projects", config: {} }], updated_at: "2026-09-24T00:00:00Z" })

    render(<DashboardPage projects={projects} />)

    expect(await screen.findByText("Operations", { selector: "strong" })).toBeInTheDocument()
    expect(await screen.findByText("4 entries · 2h")).toBeInTheDocument()
  })

  it("shows only the badges that have been unlocked", async () => {
    fetchAchievements.mockResolvedValue({
      badges: [
        { key: "a", name: "First Chapter", tier: "bronze", category: "projects", blurb: "You began.", earned: true, progress: 1, target: 1 },
        { key: "b", name: "Grand Library", tier: "gold", category: "projects", blurb: "Many.", earned: false, progress: 1, target: 10 },
      ],
    })
    fetchDashboard.mockResolvedValue({ panels: [{ id: "pb", type: "badges", config: {} }], updated_at: "2026-09-24T00:00:00Z" })

    render(<DashboardPage projects={projects} />)

    expect(await screen.findByText("First Chapter")).toBeInTheDocument()
    expect(screen.queryByText("Grand Library")).not.toBeInTheDocument()
  })

  it("adds a badges panel from the form", async () => {
    fetchAchievements.mockResolvedValue({ badges: [] })
    fetchDashboard.mockResolvedValue({ panels: [], updated_at: "2026-09-24T00:00:00Z" })
    updateDashboardPanels.mockResolvedValue({ panels: [], updated_at: "2026-09-24T00:01:00Z" })

    render(<DashboardPage projects={projects} />)
    await screen.findByText(/Your dashboard is empty/)
    fireEvent.click(screen.getByRole("button", { name: "+ Add panel" }))
    fireEvent.change(screen.getByLabelText("Panel type"), { target: { value: "badges" } })
    fireEvent.click(screen.getByRole("button", { name: "Add panel" }))

    await waitFor(() => expect(updateDashboardPanels).toHaveBeenCalled())
    expect(updateDashboardPanels.mock.calls[0][0][0]).toMatchObject({ type: "badges", config: {} })
  })
})
