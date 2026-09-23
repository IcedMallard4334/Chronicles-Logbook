import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(), fetchProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  archiveProject: vi.fn(), unarchiveProject: vi.fn(), fetchEntries: vi.fn(), fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(), createEntry: vi.fn(), deleteAccount: vi.fn(), sendAIMessage: vi.fn(), signOut: vi.fn(),
  fetchStatistics: vi.fn(), previewSchemaChange: vi.fn(), updateSchema: vi.fn(),
  fetchProjectMembers: vi.fn(() => Promise.resolve([])), shareProject: vi.fn(), unshareProject: vi.fn(),
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

// A second place a link can point, so one can be aimed somewhere else.
const thesisProject = {
  id: "proj-3", name: "Thesis", description: null, archived: false,
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
  const heading = await screen.findByRole("heading", { name: "Recorded so far" })
  return heading.closest(".entry-list")
}

/** Pick a field's type from the picker, which is a grid of explained cards
 *  rather than a dropdown — nine type names in a select read as synonyms. */
function chooseType(index, label) {
  fireEvent.click(screen.getAllByLabelText("Type")[index])
  fireEvent.click(screen.getByRole("radio", { name: label }))
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

  it("says which project a link points at", async () => {
    const LINK = {
      id: "f-link", name: "Related project", type: "project_reference",
      linked_project_id: "proj-2",
    }
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])

    await openProject("Schema")

    expect(await screen.findByText("Links to Reading List")).toBeInTheDocument()
  })

  it("says when a link points at a project that is gone", async () => {
    const LINK = {
      id: "f-link", name: "Related project", type: "project_reference",
      linked_project_id: "proj-gone",
    }
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }])

    await openProject("Schema")

    expect(await screen.findByText("Links to a project you no longer have")).toBeInTheDocument()
  })

  it("opens the schema from the field count", async () => {
    // The count sits exactly where field-related content is being read, so it
    // doubles as a way in rather than waiting for the tab bar to be found.
    await openProject()

    fireEvent.click(screen.getByRole("button", { name: "2 fields · Schema" }))

    expect(await screen.findByRole("button", { name: "Edit schema" })).toBeInTheDocument()
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

  it("offers every field type the builder knows about", async () => {
    await openSchemaEditor()
    fireEvent.click(screen.getAllByLabelText("Type")[0])

    const cards = screen.getAllByRole("radio")
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Text", "Number", "Date", "Choice", "Tags", "Checklist", "Entry link",
      "Project link", "Calculation",
    ])
  })

  it("explains what each type is for rather than only naming it", async () => {
    // Nine type names in a dropdown read as synonyms: "Tags", "Choice" and
    // "Checklist" all sound like "a list of things", which is how people
    // picked one and then concluded the field types were broken.
    await openSchemaEditor()
    fireEvent.click(screen.getAllByLabelText("Type")[0])

    const tags = screen.getByRole("radio", { name: "Tags" })
    expect(tags).toHaveTextContent("an entry can be several things at once")
    expect(tags).toHaveTextContent("Type a label and press Enter")

    const choice = screen.getByRole("radio", { name: "Choice" })
    expect(choice).toHaveTextContent("you want exactly one of them every time")
  })

  it("says why a type cannot be picked yet instead of hiding it", async () => {
    // "Where is the calculation option?" needs an answer on screen, not the
    // absence of one.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [NOTES] }])
    await openSchemaEditor()
    fireEvent.click(screen.getAllByLabelText("Type")[0])

    const calculation = screen.getByRole("radio", { name: "Calculation" })
    expect(calculation).toBeDisabled()
    expect(calculation).toHaveTextContent("Needs a number field to read from")
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

  it("refuses a field name that contains braces", async () => {
    // A calculation refers to a field by its name in braces, so a brace in a
    // name would read as half a reference.
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: "Hours {old}" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot contain braces")
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("refuses a link that does not say which project it points at", async () => {
    await openSchemaEditor()
    chooseType(1, "Project link")

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      '"Notes" needs to say which project it links to'
    )
    expect(previewSchemaChange).not.toHaveBeenCalled()
  })

  it("sends only the keys that apply to a field's type", async () => {
    // The editor keeps the options you typed before switching the type away
    // from a choice; sending them would make the edit look bigger than it is.
    updateSchema.mockResolvedValue({ ...noChanges, project: fieldNotes })
    await openSchemaEditor()
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Observations" } })
    chooseType(1, "Choice")
    fireEvent.change(screen.getByLabelText("The options to choose from"), {
      target: { value: "Yes, No" },
    })
    chooseType(1, "Text")

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
    chooseType(1, "Choice")
    chooseType(1, "Text")

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

    // The reassurance is the point: a format change never rewrites the record,
    // and "are my old entries safe?" is what anybody sensible asks first.
    expect(
      within(review).getByText(/The 4 entries already recorded stay exactly as written/)
    ).toBeInTheDocument()
    expect(within(review).getByText("'Notes' is no longer asked for.")).toBeInTheDocument()
    expect(updateSchema).not.toHaveBeenCalled()
  })

  it("spells out what a change costs in entries", async () => {
    previewSchemaChange.mockResolvedValue(removal)

    const review = await removeNotes()

    expect(
      within(review).getByText("3 entries keep what they recorded, under the old format")
    ).toBeInTheDocument()
    expect(
      within(review).getByText(/Nothing is deleted and nothing is rewritten/)
    ).toBeInTheDocument()
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

// ── Linking a project (US-2.4, schema-level links) ──────────────────────────

describe("linking a project", () => {
  it("asks which project a link points at, and offers only the other projects", async () => {
    await openSchemaEditor()
    chooseType(1, "Project link")

    const select = screen.getByLabelText("Links to")
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose a project…",
      "Reading List",
    ])
  })

  it("saves the link with the project it points at", async () => {
    updateSchema.mockResolvedValue({
      ...noChanges,
      project: {
        ...fieldNotes,
        entry_schema: [
          HOURS,
          { id: "f-notes", name: "Notes", type: "project_reference", linked_project_id: "proj-2" },
        ],
      },
    })
    await openSchemaEditor()
    chooseType(1, "Project link")
    fireEvent.change(screen.getByLabelText("Links to"), { target: { value: "proj-2" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() =>
      expect(previewSchemaChange).toHaveBeenCalledWith("proj-1", [
        HOURS,
        { id: "f-notes", name: "Notes", type: "project_reference", linked_project_id: "proj-2" },
      ])
    )
  })

  it("reports a link pointed somewhere else as the change it is", async () => {
    // A link lives in the schema, so aiming it elsewhere is a schema edit like
    // any other — one that every past entry follows, so it is reviewed first.
    const LINK = {
      id: "f-link", name: "Related project", type: "project_reference",
      linked_project_id: "proj-2",
    }
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [LINK] },
      otherProject,
      thesisProject,
    ])
    previewSchemaChange.mockResolvedValue({
      entry_count: 2,
      entries_affected: 2,
      changes: [
        {
          kind: "link_changed", field_id: "f-link", field_name: "Related project",
          description: "'Related project' will point at 'Thesis' and past entries will be relinked.",
          severity: "warning", entries_affected: 2, values_coerced: 0, values_retired: 0,
        },
      ],
    })

    await openSchemaEditor()
    fireEvent.change(screen.getByLabelText("Links to"), { target: { value: "proj-3" } })
    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    const review = await screen.findByRole("region", { name: "Review schema changes" })
    expect(within(review).getByText("Link changed")).toBeInTheDocument()
    expect(within(review).getByText(/past entries will be relinked/)).toBeInTheDocument()
    expect(updateSchema).not.toHaveBeenCalled()
  })
})

// ── Building a calculation (US-2.5) ──────────────────────────────────────────

describe("building a calculation", () => {
  async function addCalculation() {
    await openSchemaEditor()
    chooseType(1, "Calculation")
    return screen.findByLabelText("Calculation")
  }

  it("offers the number fields as sources, by name", async () => {
    await addCalculation()

    fireEvent.click(screen.getByRole("button", { name: "Hours" }))

    expect(screen.getByLabelText("Calculation")).toHaveValue("{Hours}")
  })

  it("shows a calculation saved by id as the names it was built from", async () => {
    // The server stores references by field id; the person editing the schema
    // named the fields, so the names are the form the editor speaks.
    const COST = {
      id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * 60",
    }
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, COST] },
      otherProject,
    ])
    await openSchemaEditor()

    expect(screen.getByLabelText("Calculation")).toHaveValue("{Hours} * 60")
    // Reading a stored calculation back is not itself a change to it.
    expect(screen.getByRole("button", { name: "Save schema" })).toBeDisabled()
  })

  it("reads a calculation back using field names", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} * 60" } })

    expect(await screen.findByText("= Hours * 60")).toBeInTheDocument()
  })

  it("saves a calculation written by name as the ids the server stores", async () => {
    updateSchema.mockResolvedValue({
      ...noChanges,
      project: {
        ...fieldNotes,
        entry_schema: [
          HOURS,
          { id: "f-notes", name: "Notes", type: "computed", expression: "{f-hours} * 60" },
        ],
      },
    })
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} * 60" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() =>
      expect(previewSchemaChange).toHaveBeenCalledWith("proj-1", [
        HOURS,
        { id: "f-notes", name: "Notes", type: "computed", expression: "{f-hours} * 60" },
      ])
    )
  })

  it("renames a field inside a calculation that refers to it", async () => {
    // A calculation refers to a field by its name; renaming the field must
    // carry the calculation along rather than leave it naming a ghost.
    const COST = {
      id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * 60",
    }
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, COST] },
      otherProject,
    ])
    await openSchemaEditor()

    fireEvent.change(screen.getAllByLabelText("Name")[0], { target: { value: "Minutes" } })

    expect(screen.getByLabelText("Calculation")).toHaveValue("{Minutes} * 60")
  })

  it("previews the answer while the formula is typed", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} * 60" } })

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
    fireEvent.change(expression, { target: { value: "{Hours} * 60" } })

    expect(
      await screen.findByText("Preview: 180 — from your latest entry")
    ).toBeInTheDocument()
  })

  it("accepts a field typed by name rather than picked below", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} * 2" } })

    // The "= …" line only appears once a formula reads as valid, so it is the
    // evidence that the name was understood.
    expect(await screen.findByText("= Hours * 2")).toBeInTheDocument()
  })

  it("explains a broken calculation beside the field", async () => {
    const expression = await addCalculation()

    fireEvent.change(expression, { target: { value: "{Hours} *" } })

    expect(await screen.findByText(/incomplete or mistyped/)).toBeInTheDocument()
  })

  it("will not save a broken calculation", async () => {
    const expression = await addCalculation()
    fireEvent.change(expression, { target: { value: "{Hours} +" } })

    fireEvent.click(screen.getByRole("button", { name: "Save schema" }))

    await waitFor(() => expect(previewSchemaChange).not.toHaveBeenCalled())
  })

  it("says what to do first when there is nothing to calculate from", async () => {
    // Now answered before the choice rather than after it: the type is offered
    // greyed with the reason, instead of letting somebody pick a calculation
    // and only then discover it has nothing to read.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [NOTES] }, otherProject])
    await openSchemaEditor()

    fireEvent.click(screen.getAllByLabelText("Type")[0])

    const calculation = screen.getByRole("radio", { name: "Calculation" })
    expect(calculation).toBeDisabled()
    expect(calculation).toHaveTextContent(/Needs a number field to read from/)
  })
})

// ── Filling in an entry (US-2.4, US-2.5) ─────────────────────────────────────

describe("filling in an entry", () => {
  const RATE = { id: "f-rate", name: "Rate", type: "number" }
  const COST = {
    id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * {f-rate}",
  }
  const LINK = {
    id: "f-link", name: "Related project", type: "project_reference",
    linked_project_id: "proj-2",
  }

  it("shows a calculation instead of asking for it", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST] },
      otherProject,
    ])

    await openProject()

    const form = await screen.findByRole("heading", { name: "New entry" })
    expect(screen.queryByLabelText("Cost")).not.toBeInTheDocument()
    expect(within(form.closest("form")).getByText("Calculated")).toBeInTheDocument()
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
        todo: false,
        due_date: null,
      })
    )
  })

  it("shows the linked project rather than asking for it on every entry", async () => {
    // The link is decided once, in the schema, so an entry reports it rather
    // than answers for it — the same read-only treatment a calculation gets,
    // with a tag of its own colour so the two are never confused.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])

    await openProject()

    const form = (await screen.findByRole("heading", { name: "New entry" })).closest("form")
    expect(within(form).getByText("Related project")).toBeInTheDocument()
    expect(within(form).getByText("Linked")).toBeInTheDocument()
    expect(within(form).getByText("Reading List")).toBeInTheDocument()
    expect(within(form).queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("opens the linked project from the entry form", async () => {
    // The value is a chip, not a boxed read-out: it reads as a thing you act
    // on, and acting on it takes you to the project it names.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])

    await openProject()

    fireEvent.click(screen.getByTitle("Open Reading List"))

    expect(await screen.findByRole("heading", { name: "Reading List" })).toBeInTheDocument()
  })

  it("does not send a link the server would derive from the schema", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])
    createEntry.mockResolvedValue({ id: "e1", data: {}, created_at: "2026-09-12T10:00:00Z" })
    await openProject()
    await screen.findByRole("heading", { name: "New entry" })

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith("proj-1", {
        data: {},
        time_spent: null,
        todo: false,
        due_date: null,
      })
    )
  })
})

// ── Reading entries back (US-2.4, US-2.7) ────────────────────────────────────

describe("reading entries back", () => {
  const LINK = {
    id: "f-link", name: "Related project", type: "project_reference",
    linked_project_id: "proj-2",
  }

  it("shows a linked project's name, not its id", async () => {
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-link": "proj-2" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    expect(within(await entryList()).getByText("Reading List")).toBeInTheDocument()
  })

  it("opens the linked project from beside its value", async () => {
    // A link you can act on reads as a connection between two projects; one
    // you cannot read as decoration.
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LINK] }, otherProject])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-link": "proj-2" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    const list = await entryList()
    fireEvent.click(within(list).getByTitle("Open Reading List"))

    expect(await screen.findByRole("heading", { name: "Reading List" })).toBeInTheDocument()
  })

  it("says so plainly when a linked project has gone", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [{ ...LINK, linked_project_id: "proj-gone" }] },
    ])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-link": "proj-gone" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    // The form's chip says it too — the schema points at the gone project —
    // so the assertion is scoped to where the value was recorded.
    expect(
      within(await entryList()).getByText("A project you no longer have")
    ).toBeInTheDocument()
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

  it("keeps showing what a removed field recorded, marked as no longer collected", async () => {
    // US-2.7. Removing a field stops it being asked for; it does not erase
    // what was already answered, and it no longer folds it out of sight
    // either — the value stayed on the entry, so the column stays on the list.
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS], retired_schema: [NOTES] },
      otherProject,
    ])
    fetchEntries.mockResolvedValue([
      {
        id: "e1",
        data: { "f-hours": 2, "f-notes": "Rained all day" },
        schema_snapshot: [HOURS, NOTES],
        created_at: "2026-09-12T10:00:00Z",
      },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByText("Rained all day")).toBeInTheDocument()
    expect(within(list).getByText("Notes")).toBeInTheDocument()
    expect(within(list).getByText(/1 no longer collected/)).toBeInTheDocument()
  })

  it("shows nothing extra on an entry that only used live fields", async () => {
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS], retired_schema: [NOTES] },
      otherProject,
    ])
    fetchEntries.mockResolvedValue([
      {
        id: "e1", data: { "f-hours": 2 }, schema_snapshot: [HOURS],
        created_at: "2026-09-12T10:00:00Z",
      },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByText("Hours")).toBeInTheDocument()
    expect(within(list).queryByText(/no longer collected/)).not.toBeInTheDocument()
  })

  it("says an entry predating a field has nothing recorded for it", async () => {
    // Not a blank and not a zero. A format change leaves past entries alone,
    // so the honest answer is that nobody ever answered this.
    fetchEntries.mockResolvedValue([
      {
        id: "e1", data: { "f-hours": 2 }, schema_snapshot: [HOURS],
        created_at: "2026-09-12T10:00:00Z",
      },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByText("not recorded")).toBeInTheDocument()
  })

  it("shortens a long column label but keeps the full name on hover", async () => {
    // A header three lines tall sets the height of every row beneath it; the
    // full name rides along as a tooltip so nothing is lost.
    const LONG = {
      id: "f-long", name: "Create a new environment for my level", type: "text",
    }
    fetchProjects.mockResolvedValue([{ ...fieldNotes, entry_schema: [LONG] }, otherProject])
    fetchEntries.mockResolvedValue([
      { id: "e1", data: { "f-long": "Castle" }, created_at: "2026-09-12T10:00:00Z" },
    ])

    await openProject()

    const label = within(await entryList()).getByTitle("Create a new environment for my level")
    expect(label).toHaveTextContent("Create a new enviro…")
  })

  it("marks the linked and calculated columns with a quiet dot", async () => {
    // Most columns get nothing; the two special ones carry the registry's
    // colour as a dot in their header, with the word on hover.
    const RATE = { id: "f-rate", name: "Rate", type: "number" }
    const COST = {
      id: "f-cost", name: "Cost", type: "computed", expression: "{f-hours} * {f-rate}",
    }
    fetchProjects.mockResolvedValue([
      { ...fieldNotes, entry_schema: [HOURS, RATE, COST, LINK] },
      otherProject,
    ])
    fetchEntries.mockResolvedValue([
      {
        id: "e1",
        data: { "f-hours": 3, "f-rate": 60, "f-link": "proj-2" },
        created_at: "2026-09-12T10:00:00Z",
      },
    ])

    await openProject()

    const list = await entryList()
    expect(within(list).getByTitle("Linked")).toBeInTheDocument()
    expect(within(list).getByTitle("Calculated")).toBeInTheDocument()
  })
})
