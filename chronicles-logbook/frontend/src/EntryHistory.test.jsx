import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import EntryHistory from "./EntryHistory"
import { versionAsOf } from "./entryVersions"
import DeletedEntries from "./DeletedEntries"
import { fetchDeletedEntries, fetchEntryHistory, revertEntry } from "./api"

vi.mock("./api", () => ({
  fetchEntryHistory: vi.fn(),
  revertEntry: vi.fn(),
  fetchDeletedEntries: vi.fn(),
}))

const schema = [{ id: "notes", name: "Notes", type: "text" }]

// Newest first, as the API returns it.
const history = [
  {
    id: "r3", revision: 3, action: "edited", changed_at: "2024-03-20T09:00:00Z", changed_by_name: "Sam",
    title: null, data: { notes: "Third" }, schema_snapshot: schema, time_spent: null, todo: false,
    changed_fields: ["data.notes"], previous_values: { "data.notes": "Second" }, note: "Fixed wording",
  },
  {
    id: "r2", revision: 2, action: "edited", changed_at: "2024-03-12T09:00:00Z", changed_by_name: "Sam",
    title: null, data: { notes: "Second" }, schema_snapshot: schema, time_spent: null, todo: false,
    changed_fields: ["data.notes"], previous_values: { "data.notes": "First" }, note: null,
  },
  {
    id: "r1", revision: 1, action: "created", changed_at: "2024-03-01T09:00:00Z", changed_by_name: "Sam",
    title: null, data: { notes: "First" }, schema_snapshot: schema, time_spent: null, todo: false,
    changed_fields: [], previous_values: {}, note: null,
  },
]

function renderHistory(props = {}) {
  return render(
    <EntryHistory
      projectId="p1"
      entryId="e1"
      canRevert
      formatValue={(field, value) => value ?? "—"}
      {...props}
    />
  )
}

async function openHistory() {
  fireEvent.click(screen.getByRole("button", { name: "View history" }))
  await screen.findByText("v3")
}

describe("versionAsOf", () => {
  it("picks the latest version on or before the end of the chosen day", () => {
    expect(versionAsOf(history, "2024-03-15").revision).toBe(2)
    expect(versionAsOf(history, "2024-03-20").revision).toBe(3)
    expect(versionAsOf(history, "2024-02-01")).toBeNull()
  })
})

describe("EntryHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchEntryHistory.mockResolvedValue(history)
  })

  it("lists every version with what changed and why", async () => {
    renderHistory()
    await openHistory()

    const summary = (label) => screen.getByText(label).closest(".entry-history-summary")
    expect(summary("v1")).toHaveTextContent("Created")
    expect(summary("v3")).toHaveTextContent("(current)")
    expect(screen.getAllByText("Changed: Notes")).toHaveLength(2)
    expect(screen.getByText("Fixed wording")).toBeInTheDocument()
  })

  it("shows the entry as it stood on a date, read-only, under a banner", async () => {
    renderHistory()
    await openHistory()

    fireEvent.change(screen.getByLabelText("View as it stood on"), { target: { value: "2024-03-15" } })

    expect(screen.getByText("Viewing version from 12 Mar 2024 (not current).")).toBeInTheDocument()
    expect(screen.getByText("Second")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument()
  })

  it("says so when the entry didn't exist yet on the chosen date", async () => {
    renderHistory()
    await openHistory()

    fireEvent.change(screen.getByLabelText("View as it stood on"), { target: { value: "2024-02-01" } })

    expect(screen.getByText(/No version of this entry was recorded by/)).toBeInTheDocument()
  })

  it("reverts to an earlier version with an optional reason", async () => {
    const saved = { id: "e1", data: { notes: "First" } }
    revertEntry.mockResolvedValue(saved)
    const onReverted = vi.fn()
    renderHistory({ onReverted })
    await openHistory()

    const buttons = screen.getAllByRole("button", { name: "Revert to this version" })
    // The current version (v3) offers no revert; v2 and v1 do.
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Typo" } })
    fireEvent.click(screen.getByRole("button", { name: "Yes, revert to v1" }))

    await waitFor(() => expect(revertEntry).toHaveBeenCalledWith("p1", "e1", { revision: 1, note: "Typo" }))
    await waitFor(() => expect(onReverted).toHaveBeenCalledWith(saved))
  })

  it("offers no revert to someone who can't change the entry", async () => {
    renderHistory({ canRevert: false })
    await openHistory()

    expect(screen.queryByRole("button", { name: "Revert to this version" })).not.toBeInTheDocument()
  })
})

describe("DeletedEntries", () => {
  beforeEach(() => vi.clearAllMocks())

  it("restores a deleted entry to the version before its deletion", async () => {
    const deleted = { id: "e1", project_id: "p1", title: "Gone", data: {}, deleted_at: "2024-03-21T09:00:00Z" }
    fetchDeletedEntries.mockResolvedValue([deleted])
    fetchEntryHistory.mockResolvedValue([{ ...history[0], id: "r4", revision: 4, action: "deleted" }, ...history])
    revertEntry.mockResolvedValue({ ...deleted, deleted_at: null })
    const onRestored = vi.fn()

    const { container } = render(
      <DeletedEntries project={{ id: "p1" }} liveCount={0} userId="u1" onRestored={onRestored} />
    )
    const details = container.querySelector("details")
    details.open = true
    fireEvent(details, new Event("toggle"))

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }))

    await waitFor(() => expect(revertEntry).toHaveBeenCalledWith("p1", "e1", { revision: 3 }))
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
    expect(screen.queryByText(/Gone/)).not.toBeInTheDocument()
  })
})
