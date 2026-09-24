import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchStatistics: vi.fn(), fetchFieldTimeline: vi.fn(),
  fetchProjectMembers: vi.fn(() => Promise.resolve([])), shareProject: vi.fn(), unshareProject: vi.fn(),
}))

import App from "./App"
import {
  createProject,
  fetchEntries,
  fetchEntriesGlobal,
  fetchFieldTimeline,
  fetchProjects,
  fetchStatistics,
  fetchTasks,
  sendAIMessage,
} from "./api"

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

  it("opens the field timeline view from the sidebar", async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Activity/ }))
    expect(await screen.findByRole("heading", { name: "Field Timeline" })).toBeInTheDocument()
    expect(screen.getByLabelText("Select project")).toBeInTheDocument()
    expect(screen.getByLabelText("Select field")).toBeInTheDocument()
    expect(screen.getByLabelText("Start date")).toBeInTheDocument()
    expect(screen.getByLabelText("End date")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Generate timeline" })).toBeInTheDocument()
  })

  it("generates a field timeline for a selected project and field", async () => {
  fetchFieldTimeline.mockResolvedValueOnce({
    project_id: "proj-1",
    field_id: "hours",
    field_name: "Hours",
    field_type: "number",
    start: "2026-05-01T00:00:00+00:00",
    end: "2026-05-31T23:59:59+00:00",
    points: [
      {
        entry_id: "entry-1",
        created_at: "2026-05-05T09:00:00+00:00",
        value: 5,
        schema_version: 1,
      },
      {
        entry_id: "entry-2",
        created_at: "2026-05-10T09:00:00+00:00",
        value: 8,
        schema_version: 1,
      },
    ],
  })

  render(<App />)

  fireEvent.click(await screen.findByRole("button", { name: /Activity/ }))

  fireEvent.change(screen.getByLabelText("Select project"), {
    target: { value: "proj-1" },
  })

  await waitFor(() => {
    expect(screen.getByLabelText("Select field")).toBeEnabled()
    expect(screen.getByLabelText("Select field")).toHaveValue("")
  })

  fireEvent.change(screen.getByLabelText("Select field"), {
    target: { value: "hours" },
  })

  await waitFor(() => {
    expect(screen.getByLabelText("Select field")).toHaveValue("hours")
  })

  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-05-01" },
  })

  fireEvent.change(screen.getByLabelText("End date"), {
    target: { value: "2026-05-31" },
  })

  console.log("ABOUT TO SUBMIT")

  fireEvent.submit(
    screen.getByRole("button", { name: "Generate timeline" }).closest("form"),
  )

  console.log("SUBMIT FINISHED")

  await waitFor(() => {
    expect(fetchFieldTimeline).toHaveBeenCalledWith(
      "proj-1",
      "hours",
      "2026-05-01T00:00:00",
      "2026-05-31T23:59:59",
    )
  })

  expect(await screen.findByText("2 data points")).toBeInTheDocument()
  expect(screen.getByText("5")).toBeInTheDocument()
  expect(screen.getByText("8")).toBeInTheDocument()
})

  it("shows a plain explanation instead of an empty chart for a non-numeric field", async () => {
    // A line chart has nowhere honest to put a text value on its Y-axis —
    // this used to render as a blank, confusing box. It should say so in
    // words instead, and still list every value in the table below.
    fetchFieldTimeline.mockResolvedValueOnce({
      project_id: "proj-1",
      field_id: "hours",
      field_name: "Hours",
      field_type: "text",
      start: null,
      end: null,
      points: [
        { entry_id: "entry-1", created_at: "2026-05-05T09:00:00+00:00", value: "Few more tasks to do", schema_version: 1 },
      ],
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: /Activity/ }))
    fireEvent.change(screen.getByLabelText("Select project"), { target: { value: "proj-1" } })
    await waitFor(() => expect(screen.getByLabelText("Select field")).toBeEnabled())
    fireEvent.change(screen.getByLabelText("Select field"), { target: { value: "hours" } })
    fireEvent.submit(screen.getByRole("button", { name: "Generate timeline" }).closest("form"))

    expect(await screen.findByText(/aren.t shown as a\s*line chart/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Hours over time")).not.toBeInTheDocument()
    expect(screen.getByText("Few more tasks to do")).toBeInTheDocument()
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

describe("guided tour (US-3.23)", () => {
  it("does not show the welcome tour once it has already been seen", async () => {
    window.localStorage.setItem(
      "chronicles-tours-seen",
      JSON.stringify({ "anon:1": ["welcome"] })
    )

    render(<App />)

    await screen.findByRole("listbox", { name: "Projects" })
    expect(
      screen.queryByRole("heading", { name: "This is your logbook" })
    ).not.toBeInTheDocument()
  })

  it("does not stack a project's own hint on top of the page hint that's still showing", async () => {
    // Reachable sequence: welcome already seen, the Home page's own hint has
    // not been dismissed yet, and a project is opened anyway — PageHint has
    // no scrim by design, so nothing stops that click from going through.
    window.localStorage.setItem(
      "chronicles-tours-seen",
      JSON.stringify({ "anon:1": ["welcome"] })
    )

    render(<App />)
    const projects = await screen.findByRole("listbox", { name: "Projects" })
    expect(await screen.findByRole("heading", { name: "Your workspace" })).toBeInTheDocument()

    fireEvent.click(within(projects).getByText("Field Notes"))

    await screen.findByRole("heading", { name: "Field Notes" })
    // The Home page hint ("Your workspace") is still allowed to be showing —
    // only a second, project-scoped hint stacked on top of it would be wrong.
    expect(document.querySelectorAll(".tour-layer")).toHaveLength(1)
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
