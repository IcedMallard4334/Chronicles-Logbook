import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EntryDetailModal, entryPreview, InfoTip } from "./EntryShared"
import { deleteEntry, fetchEntryHistory, fetchEntryMigrationPreview, updateEntry } from "./api"

vi.mock("./api", () => ({
  updateEntry: vi.fn(),
  // US-3.12: the Repeat section asks whether the entry repeats; it doesn't.
  fetchRecurrence: vi.fn(() => Promise.resolve(null)),
  setRecurrence: vi.fn(),
  stopRecurrence: vi.fn(),
  localDateString: vi.fn(() => "2026-09-27"),
  deleteEntry: vi.fn(),
  fetchEntryMigrationPreview: vi.fn(),
  fetchEntryHistory: vi.fn(),
  fetchTasks: vi.fn().mockResolvedValue([]),
}))

const currentSchema = [
  { id: "f-hours", name: "Hours", type: "number" },
  { id: "f-notes", name: "Notes", type: "text" },
  { id: "f-mood", name: "Mood", type: "text" },
]

const project = {
  id: "p1",
  name: "Fieldwork",
  entry_schema: currentSchema,
  schema_version: 2,
  retired_schema: [],
}

function upToDateEntry(overrides = {}) {
  return {
    id: "e1",
    project_id: "p1",
    title: null,
    data: { "f-hours": 3, "f-notes": "Site visit", "f-mood": "Focused" },
    schema_snapshot: currentSchema,
    schema_version: 2,
    retired_data: {},
    time_spent: 90,
    todo: false,
    due_date: null,
    created_by_name: "Sam",
    created_at: "2026-09-20T10:00:00Z",
    ...overrides,
  }
}

function staleEntry(overrides = {}) {
  const oldSchema = [
    { id: "f-hours", name: "Hours", type: "number" },
    { id: "f-notes", name: "Notes", type: "text" },
  ]
  return upToDateEntry({
    data: { "f-hours": 3, "f-notes": "Site visit" },
    schema_snapshot: oldSchema,
    schema_version: 1,
    ...overrides,
  })
}

describe("EntryDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the entry's own recorded values in view mode", () => {
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />)

    expect(screen.getByText("Hours")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("Site visit")).toBeInTheDocument()
  })

  it("renders as a direct child of <body>, not nested in the caller's tree", () => {
    // Regression guard: this modal opens from inside ViewTransition's
    // animated wrapper, which leaves a resolved (if visually identity)
    // `transform` on itself even after its entrance animation finishes —
    // any transform other than the literal `none` makes an ancestor a
    // containing block for a `position: fixed` descendant, so without a
    // portal this modal centers itself inside that wrapper's full
    // scrollable height instead of the real viewport, and can render
    // partly off whatever's currently on screen. Confirmed against the
    // real app (not just this unit test) via a scripted Chrome session:
    // before the portal, the modal's top could compute to a negative
    // number (above the visible viewport); after it, top/left matched the
    // exact centered values for the window size.
    const { container } = render(
      <div id="caller-wrapper">
        <EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />
      </div>
    )

    const backdrop = document.querySelector(".modal-backdrop")
    expect(backdrop).toBeInTheDocument()
    expect(backdrop.parentElement).toBe(document.body)
    expect(container.querySelector(".modal-backdrop")).not.toBeInTheDocument()
  })

  it("shows a stale entry's own field set, not the project's current one", () => {
    render(<EntryDetailModal project={project} entry={staleEntry()} onClose={vi.fn()} />)

    // "Mood" only exists in the project's current schema, not this entry's
    // own snapshot — showing it would ask about a field this entry never had.
    expect(screen.queryByText("Mood")).not.toBeInTheDocument()
    expect(screen.getByText("Hours")).toBeInTheDocument()
  })

  it("flags a stale entry so it's clear it predates the current schema", () => {
    render(<EntryDetailModal project={project} entry={staleEntry()} onClose={vi.fn()} />)

    expect(screen.getByText(/earlier version of this project/)).toBeInTheDocument()
  })

  it("does not flag an entry that already matches the current schema", () => {
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />)

    expect(screen.queryByText(/earlier version of this project/)).not.toBeInTheDocument()
  })

  it("hides Edit and Delete when the caller can't manage this entry", () => {
    render(<EntryDetailModal project={project} entry={upToDateEntry()} canManage={false} onClose={vi.fn()} />)

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("loads and displays saved entry revisions on request", async () => {
    fetchEntryHistory.mockResolvedValue([
      {
        id: "revision-2", revision: 2, changed_at: "2026-09-21T10:00:00Z",
        changed_by_name: "Sam", data: { "f-hours": 5, "f-notes": "Updated", "f-mood": "Focused" },
        schema_snapshot: currentSchema, time_spent: 120, todo: false,
      },
    ])
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "View history" }))

    await waitFor(() => expect(fetchEntryHistory).toHaveBeenCalledWith("p1", "e1"))
    expect((await screen.findByText("v2")).closest(".entry-history-summary")).toHaveTextContent("Sam")
  })

  it("saves an ordinary edit against the entry's own shape, not the current schema", async () => {
    updateEntry.mockResolvedValue({ ...upToDateEntry(), data: { ...upToDateEntry().data, "f-hours": 9 } })
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const hoursInput = screen.getByLabelText("Hours")
    fireEvent.change(hoursInput, { target: { value: "9" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalled())
    const [, , payload] = updateEntry.mock.calls[0]
    expect(payload.migrateToCurrentSchema).toBe(false)
    expect(payload.data["f-hours"]).toBe(9)
  })

  it("offers no schema choice when the entry is already current", () => {
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(screen.queryByRole("button", { name: "Update to current schema" })).not.toBeInTheDocument()
  })

  it("fetches a migration preview and pre-fills the form when migrating is chosen", async () => {
    fetchEntryMigrationPreview.mockResolvedValue({
      data: { "f-hours": 3, "f-notes": "Site visit", "f-mood": "" },
      retired_data: {},
      changes: [],
    })
    render(<EntryDetailModal project={project} entry={staleEntry()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.click(screen.getByRole("button", { name: "Update to current schema" }))

    await waitFor(() => expect(fetchEntryMigrationPreview).toHaveBeenCalledWith("p1", "e1"))
    expect(await screen.findByLabelText("Mood")).toBeInTheDocument()
  })

  it("saves a migrated edit with migrateToCurrentSchema set", async () => {
    fetchEntryMigrationPreview.mockResolvedValue({
      data: { "f-hours": 3, "f-notes": "Site visit", "f-mood": "" },
      retired_data: {},
      changes: [],
    })
    updateEntry.mockResolvedValue(upToDateEntry())
    render(<EntryDetailModal project={project} entry={staleEntry()} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.click(screen.getByRole("button", { name: "Update to current schema" }))
    await screen.findByLabelText("Mood")
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalled())
    const [, , payload] = updateEntry.mock.calls[0]
    expect(payload.migrateToCurrentSchema).toBe(true)
  })

  it("saves an entry whose recorded time is above the ceiling, as long as the time is left alone", async () => {
    updateEntry.mockResolvedValue(upToDateEntry())
    const old = upToDateEntry({ time_spent: 20000 * 60 })
    render(<EntryDetailModal project={project} entry={old} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalled())
    expect(updateEntry.mock.calls[0][2].time_spent).toBe(20000 * 60)
  })

  it("refuses raising an over-ceiling time even higher", async () => {
    const old = upToDateEntry({ time_spent: 20000 * 60 })
    render(<EntryDetailModal project={project} entry={old} onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Hours spent"), { target: { value: "20001" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByText(/at most 10,000 hours/)).toBeInTheDocument()
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it("deletes an entry only after the confirm step", async () => {
    deleteEntry.mockResolvedValue(null)
    const onDeleted = vi.fn()
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} onDeleted={onDeleted} />)

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(deleteEntry).not.toHaveBeenCalled()
    expect(screen.getByText(/restore it from Deleted entries/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("p1", "e1"))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("e1"))
  })

  it("lets a delete be cancelled without calling the API", () => {
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(deleteEntry).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("closes on Escape", () => {
    const onClose = vi.fn()
    render(<EntryDetailModal project={project} entry={upToDateEntry()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: "Escape" })

    expect(onClose).toHaveBeenCalled()
  })

  it("names a link by its target's title, never the id it stores", () => {
    // A link field holds the target's id — showing that id is showing the
    // storage, not the relationship. The target's own title is its name.
    const schema = [
      { id: "f-hours", name: "Hours", type: "number" },
      { id: "f-related", name: "Related Entry", type: "link" },
    ]
    const linkedProject = { ...project, entry_schema: schema }
    const target = upToDateEntry({
      id: "e2",
      title: "Project Alpha",
      data: { "f-hours": 2 },
      schema_snapshot: schema,
    })
    const source = upToDateEntry({
      title: "Project Beta",
      data: { "f-hours": 1, "f-related": "e2" },
      schema_snapshot: schema,
    })

    render(
      <EntryDetailModal
        project={linkedProject}
        entry={source}
        entries={[source, target]}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByTitle("This entry links to that one")).toHaveTextContent(
      "Project Alpha"
    )
  })

  it("shows who links to this entry, by name (US-2.3)", () => {
    const schema = [
      { id: "f-hours", name: "Hours", type: "number" },
      { id: "f-related", name: "Related Entry", type: "link" },
    ]
    const linkedProject = { ...project, entry_schema: schema }
    const target = upToDateEntry({
      id: "e2",
      title: "Project Alpha",
      data: { "f-hours": 2 },
      schema_snapshot: schema,
    })
    const source = upToDateEntry({
      title: "Project Beta",
      data: { "f-hours": 1, "f-related": "e2" },
      schema_snapshot: schema,
    })

    render(
      <EntryDetailModal
        project={linkedProject}
        entry={target}
        entries={[source, target]}
        onClose={vi.fn()}
      />
    )

    const backlinks = screen.getByText("Linked from").closest("p")
    expect(backlinks).toHaveTextContent("Project Beta")
  })
})

describe("entryPreview", () => {
  it("prefers the entry's title over anything its fields hold", () => {
    expect(
      entryPreview({
        title: "Project Alpha",
        data: { "f-hours": 3, "f-notes": "Site visit" },
        created_at: "2026-09-26T10:00:00Z",
      })
    ).toBe("Project Alpha")
  })

  it("never lets a link field's stored id stand in as the entry's name", () => {
    // The entry's only string values are a link target's id and some real
    // text — the text is the name; the id is bookkeeping.
    expect(
      entryPreview({
        title: null,
        data: {
          "f-related": "303566d3-9ac5-4f8c-ba69-8c02b3431d81",
          "f-notes": "Site visit",
        },
        created_at: "2026-09-26T10:00:00Z",
      })
    ).toBe("Site visit")
  })

  it("falls back to the day an entry with no name and no text was written", () => {
    expect(
      entryPreview({
        title: null,
        data: { "f-hours": 3 },
        created_at: "2026-09-26T10:00:00Z",
      })
    ).toBe(`Entry of ${new Date("2026-09-26T10:00:00Z").toLocaleDateString()}`)
  })
})

describe("InfoTip", () => {
  it("links the trigger to its text for a screen reader, not just a hover tooltip", () => {
    render(<InfoTip text="Explains the control next to it." />)

    const trigger = screen.getByRole("button", { name: "More info" })
    const bubble = screen.getByRole("tooltip", { hidden: true })
    expect(bubble).toHaveTextContent("Explains the control next to it.")
    expect(trigger).toHaveAttribute("aria-describedby", bubble.id)
  })

  it("is reachable by keyboard, not only by mouse hover", () => {
    render(<InfoTip text="Keyboard-reachable hint." />)

    const trigger = screen.getByRole("button", { name: "More info" })
    expect(trigger.tagName).toBe("BUTTON")
    expect(trigger).not.toHaveAttribute("tabindex", "-1")
  })
})
