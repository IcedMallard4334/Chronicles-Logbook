import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchStatistics: vi.fn(), previewSchemaChange: vi.fn(), updateSchema: vi.fn(),
}))

import App from "./App"
import {
  createEntry,
  fetchEntries,
  fetchEntriesGlobal,
  fetchProjects,
  fetchStatistics,
  fetchTasks,
  previewSchemaChange,
  updateSchema,
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
})

/** Open Field Notes and land on the given tab. */
async function openProject(tab) {
  render(<App />)
  const projects = await screen.findByRole("listbox", { name: "Projects" })
  fireEvent.click(within(projects).getByText("Field Notes"))
  await screen.findByRole("heading", { name: "Field Notes" })
  if (tab) fireEvent.click(screen.getByRole("tab", { name: tab }))
}

async function openSchemaEditor() {
  await openProject("Schema")
  fireEvent.click(await screen.findByRole("button", { name: "Edit schema" }))
}

/** The recorded-entries panel, so a project name in it is not confused with
 *  the same name in the sidebar. */
async function entryList() {
  const heading = await screen.findByRole("heading", { name: "Recent entries" })
  return heading.closest(".entry-list")
}

// ── Reading a schema (US-2.6) ────────────────────────────────────────────────

describe("reading a schema", () => {
  it("shows the fields without offering to change them", async () => {
    // A schema is a decision about the shape of everything already recorded,
    // so it should not be editable just by clicking into it.
    await openProject("Schema")

    expect(await screen.findByText("Hours")).toBeInTheDocument()
    expect(screen.getByText("Notes")).toBeInTheDocument()
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit schema" })).toBeInTheDocument()
  })

  it("invites a first schema to be defined rather than edited", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [] }, otherProject])

    await openProject("Schema")

    expect(await screen.findByRole("button", { name: "Define schema" })).toBeInTheDocument()
  })

  it("says that fields no longer asked for are still kept", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, retired_schema: [{ id: "f-mood", name: "Mood", type: "text" }] },
      otherProject,
    ])

    await openProject("Schema")

    expect(await screen.findByText(/1 field is no longer asked for/)).toBeInTheDocument()
  })

  it("cannot be edited while the project is archived", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, archived: true }, otherProject])

    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /Show archived/ }))
    const archived = await screen.findByRole("listbox", { name: "Archived projects" })
    fireEvent.click(within(archived).getByText("Field Notes"))
    fireEvent.click(await screen.findByRole("tab", { name: "Schema" }))

    expect(await screen.findByRole("button", { name: "Edit schema" })).toBeDisabled()
  })
})

// ── Editing a schema (US-2.6) ────────────────────────────────────────────────

describe("editing a schema", () => {
  it("reveals a row per field once editing starts", async () => {
    await openSchemaEditor()

    expect(screen.getAllByLabelText("Name")).toHaveLength(2)
    expect(screen.getAllByLabelText("Type")).toHaveLength(2)
  })

  it("offers a project link and a calculation as field types", async () => {
    await openSchemaEditor()

    const options = within(screen.getAllByLabelText("Type")[0]).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "Text", "Number", "Date", "Choice", "Project link", "Calculation",
    ])
  })

  it("saves nothing until something has changed", async () => {
    await openSchemaEditor()

    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled()
  })

  it("abandons an edit on cancel", async () => {
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: "Time" } })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText("Hours")).toBeInTheDocument()
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("refuses a field without a name before asking the server", async () => {
    await openSchemaEditor()
    fireEvent.click(screen.getByRole("button", { name: "Add field" }))

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Every field needs a name")
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("refuses two fields with the same name", async () => {
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Hours" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    expect(await screen.findByRole("alert")).toHaveTextContent('Two fields are both called "Hours"')
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("sends only the keys that apply to a field's type", async () => {
    // The editor keeps the options you typed before switching the type away
    // from a choice; sending them would make the edit look bigger than it is.
    updateSchema.mockResolvedValue({ ...noChanges, project: fieldNotes })
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Observations" } })
    fireEvent.change(screen.getAllByLabelText("Type")[1], { target: { value: "dropdown" } })
    fireEvent.change(screen.getByLabelText("Options (comma-separated)"), {
      target: { value: "Yes, No" },
    })
    fireEvent.change(screen.getAllByLabelText("Type")[1], { target: { value: "text" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() =>
      expect(previewSchemaChange).toHaveBeenCalledWith("proj-1", [
        { id: "f-hours", name: "Hours", type: "number" },
        { id: "f-notes", name: "Observations", type: "text" },
      ])
    )
  })

  it("cannot be saved when an edit cancels itself out", async () => {
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Type")[1], { target: { value: "dropdown" } })
    fireEvent.change(screen.getAllByLabelText("Type")[1], { target: { value: "text" } })

    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled()
  })
})

// ── Reviewing an edit (US-2.6, US-2.7) ───────────────────────────────────────

describe("reviewing an edit", () => {
  const removal = {
    entry_count: 4,
    entries_affected: 3,
    changes: [
      {
        kind: "removed", field_id: "f-notes", field_name: "Notes",
        description: "'Notes' is no longer asked for.", severity: "warning",
        entries_affected: 3, values_coerced: 0, values_retired: 3,
      },
    ],
  }

  async function removeNotes() {
    await openSchemaEditor()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove field" })[1])
    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))
    return screen.findByRole("region", { name: "Review schema changes" })
  }

  it("saves straight away when no entry is affected", async () => {
    // Stopping to confirm a change that touches nothing is a dialogue for its
    // own sake.
    updateSchema.mockResolvedValue({ ...noChanges, project: { ...fieldNotes, entry_schema: [HOURS] } })
    await openSchemaEditor()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove field" })[1])

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() => expect(updateSchema).toHaveBeenCalledWith("proj-1", [HOURS]))
    expect(screen.queryByRole("region", { name: "Review schema changes" })).not.toBeInTheDocument()
  })

  it("asks before changing an entry that is already recorded", async () => {
    previewSchemaChange.mockResolvedValue(removal)

    const review = await removeNotes()

    expect(within(review).getByText(/3 of 4 entries already recorded will be updated/)).toBeInTheDocument()
    expect(within(review).getByText("'Notes' is no longer asked for.")).toBeInTheDocument()
    expect(updateSchema).not.toHaveBeenCalled()
  })

  it("spells out what a change costs in entries", async () => {
    previewSchemaChange.mockResolvedValue(removal)

    const review = await removeNotes()

    expect(within(review).getByText("3 values kept but hidden")).toBeInTheDocument()
    expect(within(review).getByText(/Nothing is deleted/)).toBeInTheDocument()
  })

  it("applies the change once it is approved", async () => {
    previewSchemaChange.mockResolvedValue(removal)
    updateSchema.mockResolvedValue({
      ...removal,
      project: { ...fieldNotes, entry_schema: [HOURS], retired_schema: [NOTES] },
    })

    const review = await removeNotes()
    fireEvent.click(within(review).getByRole("button", { name: "Apply changes" }))

    await waitFor(() => expect(updateSchema).toHaveBeenCalledWith("proj-1", [HOURS]))
    expect(await screen.findByText(/3 entries were updated to match/)).toBeInTheDocument()
  })

  it("refetches entries after applying, since the migration reshapes them", async () => {
    previewSchemaChange.mockResolvedValue(removal)
    updateSchema.mockResolvedValue({ ...removal, project: { ...fieldNotes, entry_schema: [HOURS] } })

    const review = await removeNotes()
    const before = fetchEntries.mock.calls.length
    fireEvent.click(within(review).getByRole("button", { name: "Apply changes" }))

    await waitFor(() => expect(fetchEntries.mock.calls.length).toBeGreaterThan(before))
  })

  it("returns to the editor when the review is declined", async () => {
    previewSchemaChange.mockResolvedValue(removal)

    const review = await removeNotes()
    fireEvent.click(within(review).getByRole("button", { name: "Keep editing" }))

    expect(await screen.findByRole("button", { name: "Save schema" })).toBeInTheDocument()
    expect(updateSchema).not.toHaveBeenCalled()
  })

  it("reports a rejected save instead of pretending it worked", async () => {
    previewSchemaChange.mockResolvedValue(removal)
    updateSchema.mockRejectedValue(new Error("Project is archived"))

    const review = await removeNotes()
    fireEvent.click(within(review).getByRole("button", { name: "Apply changes" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Project is archived")
  })
})

// ── Building a calculation (US-2.5) ──────────────────────────────────────────

describe("building a calculation", () => {
  async function addCalculation() {
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Type")[1], { target: { value: "computed" } })
    return screen.findByLabelText("Calculation")
  }

  it("offers the number fields as sources rather than asking for an id", async () => {
    await addCalculation()

    fireEvent.click(screen.getByRole("button", { name: "Hours" }))

    expect(screen.getByLabelText("Calculation")).toHaveValue("{f-hours}")
  })

  it("reads a calculation back using field names", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{f-hours} * 60" } })

    expect(await screen.findByText("= Hours * 60")).toBeInTheDocument()
  })

  it("previews the answer while the formula is typed", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{f-hours} * 60" } })

    expect(
      await screen.findByText("Preview: 120 — with every field as 2")
    ).toBeInTheDocument()
  })

  it("previews against the project's latest entry when there is one", async () => {
    // Oldest first on purpose: the newest entry is found by date, not
    // assumed from the order the list happens to arrive in.
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-hours": 1 }, created_at: "2026-09-11T10:00:00Z" },
      { id: "e2", data: { "f-hours": 3 }, created_at: "2026-09-12T10:00:00Z" },
    ])

    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{f-hours} * 60" } })

    expect(
      await screen.findByText("Preview: 180 — from your latest entry")
    ).toBeInTheDocument()
  })

  it("recognises a field typed by name rather than picked below", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} * 2" } })

    expect(await screen.findByText(/click it below/)).toBeInTheDocument()
  })

  it("explains a broken calculation beside the field", async () => {
    const expression = await addCalculation()

    fireEvent.change(expression, { target: { value: "{f-hours} *" } })

    expect(await screen.findByText(/incomplete or mistyped/)).toBeInTheDocument()
  })

  it("will not save a broken calculation", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{f-hours} +" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() => expect(previewSchemaChange).not.toHaveBeenCalled())
  })

  it("says what to do first when there is nothing to calculate from", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [NOTES] }, otherProject])
    await openSchemaEditor()

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "computed" } })

    expect(await screen.findByText(/Add a number field first/)).toBeInTheDocument()
  })
})

// ── Filling in an entry (US-2.4, US-2.5) ─────────────────────────────────────

describe("filling in an entry", () => {
  const RATE = { id: "f-rate", name: "Rate", type: "number" }
  const COST = {
    id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * {f-rate}",
  }
  const LINK = { id: "f-link", name: "Related project", type: "project_reference" }

  it("shows a calculation instead of asking for it", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST] },
      otherProject,
    ])

    await openProject()

    const form = await screen.findByRole("heading", { name: "New entry" })
    expect(screen.queryByLabelText("Cost")).not.toBeInTheDocument()
    expect(within(form.closest("form")).getByText("calculated")).toBeInTheDocument()
  })

  it("settles a calculation as the figures are typed", async () => {
    // The whole point of a calculated field is watching it resolve, which
    // cannot wait for a round trip to the server.
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST] },
      otherProject,
    ])
    await openProject()
    await screen.findByRole("heading", { name: "New entry" })

    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "50" } })

    expect(await screen.findByText("150")).toBeInTheDocument()
  })

  it("does not send a calculation the server would recompute anyway", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST] },
      otherProject,
    ])
    createEntry.mockResolvedValue({ id: "e1", data: {}, created_at: "2026-09-12T10:00:00Z" })
    await openProject()
    await screen.findByRole("heading", { name: "New entry" })
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "50" } })

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith("proj-1", {
        data: { "f-hours": 3, "f-rate": 50 },
        time_spent: null,
      })
    )
  })

  it("picks a linked project by name from the ones that exist", async () => {
    // US-2.4: a reference must resolve to a real project, which is guaranteed
    // by never letting one be typed.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])

    await openProject()

    const select = await screen.findByLabelText("Related project")
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "No linked project",
      "Reading List",
    ])
  })

  it("sends a chosen link, and null when none is chosen", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])
    createEntry.mockResolvedValue({ id: "e1", data: {}, created_at: "2026-09-12T10:00:00Z" })
    await openProject()

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))
    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith("proj-1", {
        data: { "f-link": null }, time_spent: null,
      })
    )

    fireEvent.change(screen.getByLabelText("Related project"), { target: { value: "proj-2" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))
    await waitFor(() =>
      expect(createEntry).toHaveBeenLastCalledWith("proj-1", {
        data: { "f-link": "proj-2" }, time_spent: null,
      })
    )
  })
})

// ── Reading entries back (US-2.4, US-2.7) ────────────────────────────────────

describe("reading entries back", () => {
  const LINK = { id: "f-link", name: "Related project", type: "project_reference" }

  it("shows a linked project's name, not its id", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-link": "proj-2" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    expect(within(await entryList()).getByText("Reading List")).toBeInTheDocument()
  })

  it("says so plainly when a linked project has gone", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-link": "proj-gone" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    expect(await screen.findByText("A project you no longer have")).toBeInTheDocument()
  })

  it("marks a calculated figure so it is not mistaken for a typed one", async () => {
    const RATE = { id: "f-rate", name: "Rate", type: "number" }
    const COST = {
      id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * {f-rate}",
    }
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST] },
      otherProject,
    ])
    // No stored Cost: an entry captured offline holds none until it syncs,
    // so the list has to work it out from the figures beside it.
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-hours": 3, "f-rate": 60 }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByText("180")).toBeInTheDocument()
    expect(
      within(list).getByTitle("Calculated from the other fields on this entry")
    ).toBeInTheDocument()
  })

  it("keeps what a removed field recorded, folded away", async () => {
    // US-2.7: removing a field stops it being asked for; it does not erase
    // what was already answered.
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS], retired_schema: [NOTES] },
      otherProject,
    ])
    fetchEntries.mockResolvedValue([
      {
        id: "e1", data: { "f-hours": 2 }, retired_data: { "f-notes": "Rained all day" },
        created_at: "2026-09-12T10:00:00Z",
      },
    ])

    await openProject()

    const details = await screen.findByText("No longer recorded (1)")
    fireEvent.click(details)
    expect(screen.getByText("Rained all day")).toBeInTheDocument()
  })

  it("shows nothing extra on an entry with no retired values", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS], retired_schema: [NOTES] },
      otherProject,
    ])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-hours": 2 }, retired_data: {}, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByText("Hours")).toBeInTheDocument()
    expect(within(list).queryByText(/No longer recorded/)).not.toBeInTheDocument()
  })
})
