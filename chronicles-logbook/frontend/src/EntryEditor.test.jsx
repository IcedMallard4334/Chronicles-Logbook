/**
 * Correcting and removing an entry.
 *
 * A logbook without these is a write-only file: you mistype an hour count and
 * there is nothing to be done about it, which is what stops people trusting a
 * record enough to keep using it. The other half of what is tested here is
 * that a correction is a correction and never a migration — an entry written
 * under an older format is edited with the fields it actually has.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchEntries: vi.fn(() => Promise.resolve([])),
}))

import EntryEditor from "./EntryEditor"
import { deleteEntry, updateEntry } from "./api"

const NOTE = { id: "note", name: "What I did", type: "text" }
const HOURS = { id: "hours", name: "Hours", type: "number" }
const STAGE = {
  id: "stage",
  name: "Stage",
  type: "dropdown",
  options: ["Reading", "Writing"],
}
const TAGS = { id: "tags", name: "Topics", type: "tags" }

const project = {
  id: "p1",
  name: "Thesis",
  entry_schema: [NOTE, HOURS, STAGE, TAGS],
  retired_schema: [],
  archived: false,
}

const entry = {
  id: "e1",
  project_id: "p1",
  data: { note: "Drafted the methodology", hours: 2, stage: "Writing", tags: ["draft"] },
  schema_snapshot: [NOTE, HOURS, STAGE, TAGS],
  time_spent: 120,
  todo: false,
  due_date: null,
  created_at: "2026-09-12T10:00:00Z",
  created_by_name: "Thandi Mokoena",
}

function open(overrides = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  }
  render(<EntryEditor entry={entry} project={project} projects={[project]} {...handlers} />)
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("reading an entry", () => {
  it("opens read-only, because most openings are to read", () => {
    open()

    expect(screen.getByRole("heading", { name: "Drafted the methodology" })).toBeInTheDocument()
    expect(screen.getByText("Thandi Mokoena", { exact: false })).toBeInTheDocument()
    expect(screen.queryByLabelText("Hours")).toBeNull()
    expect(screen.getByRole("button", { name: "Edit entry" })).toBeInTheDocument()
  })

  it("shows every field under its own name", () => {
    open()

    expect(screen.getByText("What I did")).toBeInTheDocument()
    expect(screen.getByText("Writing")).toBeInTheDocument()
    expect(screen.getByText("draft")).toBeInTheDocument()
  })

  it("reads the logged time the way the rest of the app does", () => {
    open()

    // Not "2h 0m", which is what spelling it out by hand produced.
    expect(screen.getByText("2h")).toBeInTheDocument()
  })
})

describe("correcting an entry", () => {
  it("sends only what the entry's own format asks for", async () => {
    updateEntry.mockResolvedValue({ ...entry, time_spent: 180 })
    const handlers = open()

    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }))
    fireEvent.change(screen.getByDisplayValue("Drafted the methodology"), {
      target: { value: "Drafted the methodology, again" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(updateEntry).toHaveBeenCalledWith("p1", "e1", {
        data: {
          note: "Drafted the methodology, again",
          hours: 2,
          stage: "Writing",
          tags: ["draft"],
        },
        time_spent: 120,
        todo: false,
        due_date: null,
      })
    )
    expect(handlers.onSaved).toHaveBeenCalled()
  })

  it("abandons an edit on cancel", () => {
    open()

    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }))
    fireEvent.change(screen.getByDisplayValue("Drafted the methodology"), {
      target: { value: "Something else" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.getByRole("heading", { name: "Drafted the methodology" })).toBeInTheDocument()
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it("reports a refused save rather than pretending it worked", async () => {
    updateEntry.mockRejectedValue(new Error("Cannot edit entries in an archived project."))
    const handlers = open()

    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("archived project")
    expect(handlers.onSaved).not.toHaveBeenCalled()
  })
})

describe("an entry written under an earlier format", () => {
  const older = {
    ...entry,
    id: "e0",
    data: { note: "Site visit", hours: "2", mood: "Tired" },
    schema_snapshot: [NOTE, { ...HOURS, type: "text" }, { id: "mood", name: "Mood", type: "text" }],
  }

  function openOlder() {
    render(
      <EntryEditor
        entry={older}
        project={project}
        projects={[project]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />
    )
  }

  it("says which format it is being read under", () => {
    openOlder()

    expect(screen.getByRole("note")).toHaveTextContent("earlier version")
  })

  it("asks for the fields it actually has, not the ones the project grew", () => {
    // Editing against today's schema would quietly turn a correction into a
    // migration, which is the whole thing this design exists to avoid.
    openOlder()
    fireEvent.click(screen.getByRole("button", { name: "Edit entry" }))

    expect(screen.getByText("Mood")).toBeInTheDocument()
    expect(screen.queryByText("Topics")).toBeNull()
  })
})

describe("removing an entry", () => {
  it("asks before it removes", () => {
    open()

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(screen.getByText("Remove this entry for good?")).toBeInTheDocument()
    expect(deleteEntry).not.toHaveBeenCalled()
  })

  it("removes it once confirmed", async () => {
    deleteEntry.mockResolvedValue(null)
    const handlers = open()

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove entry" }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("p1", "e1"))
    expect(handlers.onDeleted).toHaveBeenCalledWith("e1")
  })

  it("offers neither editing nor removal in an archived project", () => {
    render(
      <EntryEditor
        entry={entry}
        project={{ ...project, archived: true }}
        projects={[project]}
        canEdit={false}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    expect(screen.queryByRole("button", { name: "Edit entry" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
  })
})
