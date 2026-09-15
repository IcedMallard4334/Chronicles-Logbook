import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchStatistics: vi.fn(), fetchFieldTimeline: vi.fn(),
  fetchFieldStatistics: vi.fn(() => Promise.resolve({ project_id: "", schema_version: 1, fields: [] })),
  fetchProjectMembers: vi.fn(() => Promise.resolve([])), shareProject: vi.fn(), unshareProject: vi.fn(),
}))

import App from "./App"
import {
  createProject,
  fetchEntries,
  fetchEntriesGlobal,
  fetchFieldStatistics,
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
      current_streak: 6, longest_streak: 19,
      first_entry_at: "2026-01-04T08:12:00Z", last_entry_at: "2026-09-10T17:40:00Z",
    },
    projects: [],
  }

  it("shows the run of days being kept up, with the best run on hover", async () => {
    // Basic tier: "where a run of days has been kept up". The longest run is
    // kept to a tooltip so a broken streak still shows what was achieved.
    fetchStatistics.mockResolvedValue(statistics)

    render(<App />)

    const summary = await screen.findByLabelText("Workspace summary")
    await waitFor(() => expect(within(summary).getByText("6")).toBeInTheDocument())
    const streak = within(summary).getByText("6").closest("span")
    expect(streak).toHaveTextContent("day streak")
    expect(streak).toHaveAttribute("title", "Longest run: 19 days")
    expect(streak).toHaveClass("is-streak-alive")
  })

  it("does not mark a broken streak as alive", async () => {
    fetchStatistics.mockResolvedValue({
      ...statistics,
      totals: { ...statistics.totals, current_streak: 0, longest_streak: 1 },
    })

    render(<App />)

    const summary = await screen.findByLabelText("Workspace summary")
    await waitFor(() => expect(within(summary).getByText("128")).toBeInTheDocument())
    const streak = within(summary).getByText("day streak").closest("span")
    expect(streak).not.toHaveClass("is-streak-alive")
    expect(streak).toHaveAttribute("title", "Longest run: 1 day")
  })

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
    // entries, logged, active days, day streak — every server-derived figure.
    expect(within(await screen.findByLabelText("Workspace summary")).getAllByText("–")).toHaveLength(4)
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

  it("opens the statistics view from the sidebar", async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Statistics/ }))
    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeInTheDocument()
    expect(screen.getByLabelText("Select project")).toBeInTheDocument()
    expect(screen.getByLabelText("Select field")).toBeInTheDocument()
    expect(screen.getByLabelText("Start date")).toBeInTheDocument()
    expect(screen.getByLabelText("End date")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Generate timeline" })).toBeInTheDocument()
  })

  it("totals and groups every field as soon as a project is chosen", async () => {
    // US-2.10. This existed as an endpoint with tests and no interface: an
    // owner could not total or group by a field anywhere in the app.
    fetchFieldStatistics.mockResolvedValueOnce({
      project_id: "proj-1",
      schema_version: 2,
      fields: [
        { field_id: "hours", name: "Hours", type: "number", count: 4, total: 13, average: 3.25, groups: [] },
        {
          field_id: "status", name: "Status", type: "dropdown", count: 4, total: null, average: null,
          // Deliberately smallest first: the API returns groups in the order it
          // first saw them, and the panel must sort, not merely pass through.
          groups: [{ value: "Closed", count: 1 }, { value: "Open", count: 3 }],
        },
        {
          // Free text is grouped by the API too — every distinct note becomes a
          // group of one — and drawing that as bars would be noise.
          field_id: "note", name: "Note", type: "text", count: 2, total: null, average: null,
          groups: [{ value: "fixed the build", count: 1 }, { value: "wrote tests", count: 1 }],
        },
      ],
    })

    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Statistics/ }))
    fireEvent.change(screen.getByLabelText("Select project"), { target: { value: "proj-1" } })

    const panel = await screen.findByRole("region", { name: "Field statistics" })
    expect(fetchFieldStatistics).toHaveBeenCalledWith("proj-1")

    // A number field is totalled and averaged …
    const hours = within(panel).getByRole("heading", { name: "Hours" }).closest("article")
    expect(within(hours).getByText("13")).toBeInTheDocument()
    expect(within(hours).getByText("3.25")).toBeInTheDocument()

    // … a choice field is grouped and counted, sorted largest first …
    const status = within(panel).getByRole("list", { name: "Status by value" })
    const rows = within(status).getAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("Open")
    expect(rows[0]).toHaveTextContent("3")
    expect(rows[1]).toHaveTextContent("Closed")
    expect(rows[1]).toHaveTextContent("1")

    // … and a free-text field gets its count but no bars.
    const note = within(panel).getByRole("heading", { name: "Note" }).closest("article")
    expect(within(note).getByText("2")).toBeInTheDocument()
    expect(within(panel).queryByRole("list", { name: "Note by value" })).toBeNull()
  })

  it("says so when there is nothing to total", async () => {
    fetchFieldStatistics.mockResolvedValueOnce({ project_id: "proj-1", schema_version: 1, fields: [] })

    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Statistics/ }))
    fireEvent.change(screen.getByLabelText("Select project"), { target: { value: "proj-1" } })

    expect(await screen.findByText(/Nothing to total yet/)).toBeInTheDocument()
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

  fireEvent.click(await screen.findByRole("button", { name: /Statistics/ }))

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
