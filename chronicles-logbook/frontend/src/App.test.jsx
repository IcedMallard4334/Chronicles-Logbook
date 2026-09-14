import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchStatistics: vi.fn(),
}))

import App from "./App"
import { createProject, fetchEntries, fetchEntriesGlobal, fetchProjects, fetchStatistics, fetchTasks, sendAIMessage } from "./api"

const emptyStatistics = {
  totals: {
    projects: 0, active_projects: 0, archived_projects: 0,
    entries: 0, time_spent: 0, active_days: 0,
    first_entry_at: null, last_entry_at: null,
  },
  projects: [],
}

const fieldNotes = {
  id: "proj-1", name: "Field Notes", description: "Notes from the field", archived: false,
  entry_schema: [{ id: "hours", name: "Hours", type: "number" }],
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, "", "/app?view=home")
  vi.clearAllMocks()
  fetchProjects.mockResolvedValue([fieldNotes])
  fetchEntries.mockResolvedValue([])
  fetchEntriesGlobal.mockResolvedValue([])
  fetchTasks.mockResolvedValue([])
  fetchStatistics.mockResolvedValue(emptyStatistics)
})

describe("workspace summary", () => {
  const statistics = {
    totals: {
      projects: 3, active_projects: 2, archived_projects: 1,
      entries: 128, time_spent: 200, active_days: 47,
      first_entry_at: "2026-01-04T08:12:00Z", last_entry_at: "2026-09-10T17:40:00Z",
    },
    projects: [],
  }

  it("shows server-side totals rather than counting loaded entries", async () => {
    // The bug this replaces: entries are only loaded for the open project, so
    // a client-side sum reported one project's count as the whole logbook.
    fetchStatistics.mockResolvedValue(statistics)
    fetchEntries.mockResolvedValue([{ id: "e1", data: {}, created_at: "2026-09-10T17:40:00Z" }])

    render(<App />)

    const summary = await screen.findByLabelText("Workspace summary")
    await waitFor(() => expect(within(summary).getByText("128")).toBeInTheDocument())
    expect(within(summary).getByText("47")).toBeInTheDocument()
  })

  it("renders time logged as hours and minutes", async () => {
    fetchStatistics.mockResolvedValue(statistics)

    render(<App />)

    const summary = await screen.findByLabelText("Workspace summary")
    await waitFor(() => expect(within(summary).getByText("3h 20m")).toBeInTheDocument())
  })

  it("stays usable when statistics cannot be loaded", async () => {
    // The summary is supplementary — a failure must not take the sidebar down.
    fetchStatistics.mockRejectedValue(new Error("offline"))

    render(<App />)

    const projects = await screen.findByRole("listbox", { name: "Projects" })
    expect(within(projects).getByText("Field Notes")).toBeInTheDocument()
    expect(within(await screen.findByLabelText("Workspace summary")).getAllByText("–")).toHaveLength(3)
  })

  it("refetches totals when the project list changes", async () => {
    fetchStatistics.mockResolvedValue(statistics)

    render(<App />)
    await screen.findByLabelText("Workspace summary")

    const callsBefore = fetchStatistics.mock.calls.length
    fireEvent.click(within(await screen.findByRole("listbox", { name: "Projects" })).getByText("Field Notes"))

    await waitFor(() => expect(fetchStatistics.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe("App workspace", () => {
  it("shows the current workspace project navigator", async () => {
    render(<App />)
    const projects = await screen.findByRole("listbox", { name: "Projects" })
    expect(within(projects).getByText("Field Notes")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Mira" })).toBeInTheDocument()
  })

  it("opens a project from the workspace navigator", async () => {
    render(<App />)
    const projects = await screen.findByRole("listbox", { name: "Projects" })
    fireEvent.click(within(projects).getByText("Field Notes"))
    expect(await screen.findByRole("heading", { name: "Field Notes" })).toBeInTheDocument()
  })

  it("opens the current activity view from the sidebar", async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Activity/ }))
    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    expect(fetchEntriesGlobal).toHaveBeenCalledWith({ q: "", projectId: "", page: 1, pageSize: 20 })
  })

  it("keeps standard project creation available", async () => {
    fetchProjects.mockResolvedValue([])
    createProject.mockResolvedValue(fieldNotes)
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: "Create project" }))
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Field Notes" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm create project" }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: "Field Notes", description: null, entry_schema: [] }))
  })
})

describe("Mira project proposals", () => {
  const proposal = { type: "create_project", payload: { name: "Research notes", description: "Weekly findings" }, requires_confirmation: true }

  async function proposeProject() {
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: "Mira" }))
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "Create research notes" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    return screen.findByRole("region", { name: "Proposed project" })
  }

  it("shows a safe proposal and creates nothing before confirmation", async () => {
    sendAIMessage.mockResolvedValue({ action: proposal })
    await proposeProject()
    expect(createProject).not.toHaveBeenCalled()
  })

  it("uses the existing authenticated project request once after confirmation", async () => {
    const created = { ...fieldNotes, id: "proj-new", name: "Research notes", description: "Weekly findings" }
    sendAIMessage.mockResolvedValue({ action: proposal })
    createProject.mockResolvedValue(created)
    fetchProjects.mockResolvedValueOnce([fieldNotes]).mockResolvedValueOnce([fieldNotes, created])
    await proposeProject()
    const confirm = screen.getByRole("button", { name: "Create project" })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1))
    expect(createProject).toHaveBeenCalledWith({ name: "Research notes", description: "Weekly findings", entry_schema: [] })
    expect(await screen.findByText(/Created “Research notes”/)).toBeInTheDocument()
  })

  it("cancels a proposal without creating a project", async () => {
    sendAIMessage.mockResolvedValue({ action: proposal })
    await proposeProject()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(createProject).not.toHaveBeenCalled()
    expect(screen.queryByRole("region", { name: "Proposed project" })).not.toBeInTheDocument()
  })

  it("rejects a duplicate proposed project name before posting", async () => {
    sendAIMessage.mockResolvedValue({ action: { ...proposal, payload: { name: "Field Notes" } } })
    await proposeProject()
    fireEvent.click(screen.getByRole("button", { name: "Create project" }))
    expect(createProject).not.toHaveBeenCalled()
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists")
  })
})
