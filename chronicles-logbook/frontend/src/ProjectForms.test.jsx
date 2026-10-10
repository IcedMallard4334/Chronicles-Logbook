import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchDashboard: vi.fn(() => Promise.resolve({ panels: [], columns: 3, updated_at: "2026-09-24T00:00:00Z" })), updateDashboardPanels: vi.fn(), fetchSavedFilters: vi.fn(() => Promise.resolve([])),
  fetchAchievements: vi.fn(() => Promise.resolve({ badges: [], earned: 0, total: 0, by_tier: {}, by_category: {} })), markAchievementsSeen: vi.fn(() => Promise.resolve()), ACTIVITY_EVENT: "chronicles-activity",
  fetchStreaks: vi.fn(() => Promise.resolve(null)), recordStreakActivity: vi.fn(() => Promise.resolve(null)), STREAKS_CHANGED: "chronicles-streaks-changed",
  createMiraConversation: vi.fn(() => Promise.resolve({ id: "conv-1" })), fetchMiraConversations: vi.fn(() => Promise.resolve([])),
  fetchMiraConversation: vi.fn(), deleteMiraConversation: vi.fn(), streamMiraReply: vi.fn(() => Promise.resolve()),
  fetchStatistics: vi.fn(), previewSchemaChange: vi.fn(), updateSchema: vi.fn(),
  fetchProjectMembers: vi.fn(() => Promise.resolve([])), shareProject: vi.fn(), unshareProject: vi.fn(),
  fetchRules: vi.fn(() => Promise.resolve([])), fetchRecurrences: vi.fn(() => Promise.resolve([])),
  fetchRecurrence: vi.fn(() => Promise.resolve(null)), localDateString: vi.fn(() => "2026-09-27"),
  fetchReminders: vi.fn(() => Promise.resolve({ items: [], overdue_count: 0, due_today_count: 0, upcoming_count: 0, occurrences_created: 0 })),
}))

import App from "./App"
import {
  createEntry, createProject, fetchEntries, fetchEntriesGlobal, fetchProjects, fetchStatistics, fetchTasks,
  previewSchemaChange, updateSchema,
} from "./api"

const emptyStatistics = {
  totals: {
    projects: 0, active_projects: 0, archived_projects: 0,
    entries: 0, time_spent: 0, active_days: 0,
    first_entry_at: null, last_entry_at: null,
  },
  projects: [],
}

const HOURS = { id: "f-hours", name: "Hours", type: "number" }
const NOTES = { id: "f-notes", name: "Notes", type: "text" }

const fieldNotes = {
  id: "proj-1", name: "Field Notes", description: null, archived: false,
  entry_schema: [HOURS, NOTES], retired_schema: [],
}

const otherProject = {
  id: "proj-2", name: "Reading List", description: null, archived: false,
  entry_schema: [], retired_schema: [],
}

const noChanges = { entry_count: 0, entries_affected: 0, changes: [] }

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, "", "/app?view=home")
  vi.clearAllMocks()
  fetchProjects.mockResolvedValue([fieldNotes, otherProject])
  fetchEntries.mockResolvedValue([])
  fetchEntriesGlobal.mockResolvedValue([])
  fetchTasks.mockResolvedValue([])
  fetchStatistics.mockResolvedValue(emptyStatistics)
  previewSchemaChange.mockResolvedValue(noChanges)
  updateSchema.mockResolvedValue({ ...noChanges, project: fieldNotes })
})

async function openProject(tab) {
  render(<MemoryRouter><App /></MemoryRouter>)
  const projects = await screen.findByRole("list", { name: "Projects" })
  fireEvent.click(within(projects).getByText("Field Notes"))
  await screen.findByRole("heading", { name: "Field Notes" })
  if (tab) fireEvent.click(screen.getByRole("tab", { name: tab }))
}

async function openSchemaEditor() {
  await openProject("Schema")
  fireEvent.click(await screen.findByRole("button", { name: "Edit schema" }))
}

describe("the fields every entry has", () => {
  it("shows the title and the time greyed out above the project's own fields", async () => {
    await openProject("Schema")

    const builtIn = await screen.findByRole("group", { name: "Built-in fields" })
    expect(within(builtIn).getByText("Title")).toBeInTheDocument()
    expect(within(builtIn).getByText("Hours spent")).toBeInTheDocument()
    expect(within(builtIn).getByText("Minutes spent")).toBeInTheDocument()
    expect(within(builtIn).getByText("Short text")).toBeInTheDocument()
    expect(within(builtIn).getAllByText("Number")).toHaveLength(2)
    expect(within(builtIn).getAllByText(/Built in\./)).toHaveLength(3)
    expect(screen.getByText("Notes", { selector: ":not([role=tab])" })).toBeInTheDocument()
  })

  it("keeps them on show, but disabled and impossible to remove, while the schema is edited", async () => {
    await openSchemaEditor()

    expect(screen.getByLabelText("Title (built-in field name)")).toBeDisabled()
    expect(screen.getByLabelText("Title (built-in field type)")).toBeDisabled()
    expect(screen.getByLabelText("Hours spent (built-in field name)")).toBeDisabled()
    expect(screen.getByLabelText("Minutes spent (built-in field type)")).toBeDisabled()
    // Only the project's own two fields can be removed or renamed.
    expect(screen.getAllByRole("button", { name: "Remove field" })).toHaveLength(2)
    expect(screen.getAllByLabelText("Name")).toHaveLength(2)
  })

  it("is not asked to define anything first: a project with no fields of its own still has them", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [] }, otherProject])
    await openProject("Schema")

    expect(await screen.findByRole("group", { name: "Built-in fields" })).toBeInTheDocument()
    expect(screen.getByText("Nothing added on top of these yet.")).toBeInTheDocument()
  })

  it("lets a project with no fields of its own log an entry with just the built-in ones", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [] }, otherProject])
    createEntry.mockResolvedValue({ id: "e1", data: {}, created_at: "2026-09-12T10:00:00Z" })
    await openProject()
    await screen.findByRole("heading", { name: "New entry" })

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Quick one" } })
    fireEvent.change(screen.getByLabelText("Hours spent"), { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    expect(createEntry.mock.calls[0][1]).toMatchObject({ title: "Quick one", data: {}, time_spent: 60 })
  })

  it("refuses a new field that takes a built-in field's name", async () => {
    await openSchemaEditor()

    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: "title" } })
    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    expect(await screen.findByText(/"title" is already built in to every entry/)).toBeInTheDocument()
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("leaves alone a field that already had such a name before the built-ins existed", async () => {
    const OLD = { id: "f-old", name: "Title", type: "text" }
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [OLD, NOTES] }, otherProject])
    await openSchemaEditor()

    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Observations" } })
    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() => expect(previewSchemaChange).toHaveBeenCalled())
  })
})

describe("making a field required or not", () => {
  it("offers a switch on every field the person fills in, and none on a calculation", async () => {
    const COST = { id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * 2" }
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [HOURS, NOTES, COST] }, otherProject])
    await openSchemaEditor()

    expect(screen.getAllByRole("checkbox", { name: /Required/ })).toHaveLength(2)
  })

  it("saves a field that is not required as such, and leaves the default unsaid", async () => {
    await openSchemaEditor()

    const [hoursSwitch, notesSwitch] = screen.getAllByRole("checkbox", { name: /Required/ })
    expect(hoursSwitch).toBeChecked()
    fireEvent.click(notesSwitch)
    expect(notesSwitch).not.toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() =>
      expect(previewSchemaChange).toHaveBeenCalledWith("proj-1", [
        { id: "f-hours", name: "Hours", type: "number" },
        { id: "f-notes", name: "Notes", type: "text", required: false },
      ])
    )
  })

  it("says so in the read-only list when a field is optional", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [HOURS, { ...NOTES, required: false }] }, otherProject])
    await openProject("Schema")

    expect(await screen.findByText("Optional")).toBeInTheDocument()
  })
})

describe("short text and long text in an entry", () => {
  const PLACE = { id: "f-place", name: "Place", type: "text" }
  const STORY = { id: "f-story", name: "Story", type: "long_text", required: false }

  async function openNewEntry(schema) {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: schema }, otherProject])
    createEntry.mockResolvedValue({ id: "e1", data: {}, created_at: "2026-09-12T10:00:00Z" })
    await openProject()
    await screen.findByRole("heading", { name: "New entry" })
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Out and about" } })
  }

  it("gives a line for short text and a tall box for long text, each with its type and its limit", async () => {
    await openNewEntry([PLACE, STORY])

    const place = screen.getByLabelText("Place")
    const story = screen.getByLabelText("Story")
    // Short text is one line that grows downwards; long text is the tall box.
    expect(place).toHaveClass("short-text-box")
    expect(story).not.toHaveClass("short-text-box")
    expect(place).toHaveAttribute("maxlength", "255")
    expect(story.tagName).toBe("TEXTAREA")
    expect(story).toHaveAttribute("maxlength", "5000")
    expect(within(place.closest(".form-field")).getByText("Short text")).toBeInTheDocument()
    expect(within(story.closest(".form-field")).getByText("Long text")).toBeInTheDocument()
    expect(within(place.closest(".form-field")).getByText("0 / 255")).toBeInTheDocument()
    expect(within(story.closest(".form-field")).getByText("0 / 5,000")).toBeInTheDocument()
    expect(place.closest(".form-field")).toHaveClass("is-short")
    expect(story.closest(".form-field")).toHaveClass("is-long")
  })

  it("counts what is typed", async () => {
    await openNewEntry([PLACE, STORY])

    fireEvent.change(screen.getByLabelText("Story"), { target: { value: "A long day by the lake." } })

    expect(screen.getByText("23 / 5,000")).toBeInTheDocument()
  })

  it("marks the fields that are needed with an asterisk, and not the ones that are not", async () => {
    await openNewEntry([PLACE, STORY])

    expect(within(screen.getByLabelText("Place").closest(".form-field")).getByTitle("Required")).toBeInTheDocument()
    expect(within(screen.getByLabelText("Story").closest(".form-field")).queryByTitle("Required")).not.toBeInTheDocument()
    expect(within(screen.getByLabelText("Title").closest(".form-field")).getByTitle("Required")).toBeInTheDocument()
  })

  it("says which required fields are empty instead of saving, and lets an optional one stay empty", async () => {
    await openNewEntry([PLACE, STORY])

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))
    expect(await screen.findByText("Fill in Place before saving.")).toBeInTheDocument()
    expect(createEntry).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "The lake" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    expect(createEntry.mock.calls[0][1].data).toMatchObject({ "f-place": "The lake" })
  })

  it("does not ask for anything while the entry is still to do", async () => {
    await openNewEntry([PLACE, STORY])
    fireEvent.click(screen.getByLabelText(/This is still to do/))

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
  })

  it("leaves a tags field out of the entry when it is not required and has none", async () => {
    const LABELS = { id: "f-labels", name: "Labels", type: "tags", required: false }
    await openNewEntry([LABELS])

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    expect(createEntry.mock.calls[0][1].data).toEqual({})
  })
})

describe("starting a project from the default form", () => {
  async function openDrawer() {
    fetchProjects.mockResolvedValue([])
    render(<MemoryRouter><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Create project" }))
    return screen.getByRole("dialog", { name: "Start a new project" })
  }

  it("opens as a drawer that shows the built-in fields and a description and a date to start from", async () => {
    const drawer = await openDrawer()

    expect(drawer).toHaveAttribute("aria-modal", "false")
    const builtIn = within(drawer).getByRole("group", { name: "Built-in fields" })
    expect(within(builtIn).getByDisplayValue("Title")).toBeDisabled()
    expect(within(builtIn).getByDisplayValue("Hours spent")).toBeDisabled()
    // The starting point is editable: a description and a date.
    const names = within(drawer).getAllByLabelText("Name")
    expect(names.map((name) => name.value)).toEqual(["Description", "Date"])
    expect(within(drawer).getAllByRole("button", { name: "Remove field" })).toHaveLength(2)
  })

  it("lets the description and date be changed, removed, and added to before the project exists", async () => {
    createProject.mockResolvedValue({ id: "p9", name: "Garden", entry_schema: [], retired_schema: [] })
    const drawer = await openDrawer()

    fireEvent.change(within(drawer).getByLabelText("Project name"), { target: { value: "Garden" } })
    fireEvent.change(within(drawer).getAllByLabelText("Name")[1], { target: { value: "Planted on" } })
    fireEvent.click(within(drawer).getAllByRole("button", { name: "Remove field" })[0])
    fireEvent.click(within(drawer).getByRole("button", { name: "Add field" }))
    const names = within(drawer).getAllByLabelText("Name")
    fireEvent.change(names[names.length - 1], { target: { value: "Soil" } })
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm create project" }))

    await waitFor(() => expect(createProject).toHaveBeenCalled())
    expect(createProject.mock.calls[0][0]).toMatchObject({
      name: "Garden",
      entry_schema: [
        expect.objectContaining({ name: "Planted on", type: "date", required: false }),
        expect.objectContaining({ name: "Soil", type: "text" }),
      ],
    })
  })

  it("points out a field that takes a built-in name, and keeps the drawer open", async () => {
    const drawer = await openDrawer()
    fireEvent.change(within(drawer).getByLabelText("Project name"), { target: { value: "Garden" } })
    fireEvent.change(within(drawer).getAllByLabelText("Name")[1], { target: { value: "Title" } })

    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm create project" }))

    expect(await within(drawer).findByText(/"Title" is already built in to every entry/)).toBeInTheDocument()
    expect(createProject).not.toHaveBeenCalled()
  })

  it("says what went wrong beside the form when the project cannot be made", async () => {
    createProject.mockRejectedValue(new Error("The server said no."))
    const drawer = await openDrawer()
    fireEvent.change(within(drawer).getByLabelText("Project name"), { target: { value: "Garden" } })

    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm create project" }))

    expect(await within(drawer).findByText("The server said no.")).toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "Start a new project" })).toBeInTheDocument()
  })

  it("starts again from the default form after it is cancelled", async () => {
    const drawer = await openDrawer()
    fireEvent.change(within(drawer).getByLabelText("Project name"), { target: { value: "Half done" } })
    fireEvent.click(within(drawer).getAllByRole("button", { name: "Remove field" })[0])

    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog", { name: "Start a new project" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Create project" }))

    const again = screen.getByRole("dialog", { name: "Start a new project" })
    expect(within(again).getByLabelText("Project name")).toHaveValue("")
    expect(within(again).getAllByRole("button", { name: "Remove field" })).toHaveLength(2)
  })
})
