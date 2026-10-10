import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ProjectNotes, { authorHue } from "./ProjectNotes"
import { createNote, deleteNote, fetchNotes, updateNote } from "./api"

vi.mock("./api", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}))

// The few gestures these tests need, on top of fireEvent (the repo has no user-event package).
const userEvent = {
  setup: () => ({
    click: async (element) => fireEvent.click(element),
    clear: async (element) => fireEvent.change(element, { target: { value: "" } }),
    type: async (element, text) => fireEvent.change(element, { target: { value: element.value + text } }),
  }),
}

const note = (overrides = {}) => ({
  id: "n1",
  project_id: "p1",
  author: { user_id: "u1", full_name: "Thandi Nkosi", avatar_url: null },
  body: "Check the calibration",
  visibility: "private",
  pinned: false,
  created_at: "2026-10-09T08:00:00Z",
  updated_at: "2026-10-09T08:00:00Z",
  mine: true,
  can_edit: true,
  can_delete: true,
  ...overrides,
})

describe("authorHue", () => {
  it("gives the same person the same colour every time", () => {
    expect(authorHue("user-123")).toBe(authorHue("user-123"))
  })

  it("gives different people different colours across a team", () => {
    const hues = new Set(["a", "b", "c", "d", "e", "f"].map(authorHue))
    expect(hues.size).toBeGreaterThan(2)
  })

  it("falls back to a neutral hue when the author is unknown", () => {
    expect(authorHue(null)).toBe(215)
  })
})

describe("ProjectNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchNotes.mockResolvedValue([])
  })

  afterEach(() => vi.restoreAllMocks())

  it("invites the first note when there are none", async () => {
    render(<ProjectNotes projectId="p1" />)
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
  })

  it("shows private notes as private and shared notes with the author's name", async () => {
    fetchNotes.mockResolvedValue([
      note({ id: "a", body: "Mine alone" }),
      note({
        id: "b",
        body: "For the team",
        visibility: "shared",
        author: { user_id: "u2", full_name: "Sam Dube", avatar_url: null },
        mine: false,
        can_edit: false,
        can_delete: false,
      }),
    ])
    render(<ProjectNotes projectId="p1" />)

    const mine = (await screen.findByText("Mine alone")).closest("li")
    expect(within(mine).getByText("Only you can see this")).toBeInTheDocument()
    expect(within(mine).getByText("Private")).toBeInTheDocument()

    const theirs = screen.getByText("For the team").closest("li")
    expect(within(theirs).getByText("Sam Dube")).toBeInTheDocument()
    expect(within(theirs).getByText("Shared")).toBeInTheDocument()
    expect(theirs.style.getPropertyValue("--note-hue")).toBe(String(authorHue("u2")))
    // Someone else's shared note offers no edit, pin, share or delete.
    expect(within(theirs).queryByRole("button")).toBeNull()
  })

  it("adds a note that is private by default", async () => {
    createNote.mockResolvedValue(note({ id: "new", body: "Fresh" }))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText(/No notes yet/)

    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled()
    await user.type(screen.getByLabelText("New note"), "Fresh")
    await user.click(screen.getByRole("button", { name: "Add note" }))

    expect(createNote).toHaveBeenCalledWith("p1", { body: "Fresh", visibility: "private" })
    expect(await screen.findByText("Fresh")).toBeInTheDocument()
    expect(screen.getByLabelText("New note")).toHaveValue("")
  })

  it("adds a shared note when that is chosen", async () => {
    createNote.mockResolvedValue(note({ id: "new", body: "Team news", visibility: "shared" }))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText(/No notes yet/)

    await user.type(screen.getByLabelText("New note"), "Team news")
    await user.click(screen.getByRole("radio", { name: /Everyone on this project/ }))
    await user.click(screen.getByRole("button", { name: "Add note" }))

    expect(createNote).toHaveBeenCalledWith("p1", { body: "Team news", visibility: "shared" })
  })

  it("says why a note could not be saved and keeps what was typed", async () => {
    createNote.mockRejectedValue(new Error("Project not found"))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText(/No notes yet/)

    await user.type(screen.getByLabelText("New note"), "Keep me")
    await user.click(screen.getByRole("button", { name: "Add note" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Project not found")
    expect(screen.getByLabelText("New note")).toHaveValue("Keep me")
  })

  it("edits a note in place", async () => {
    fetchNotes.mockResolvedValue([note()])
    updateNote.mockResolvedValue(note({ body: "Changed" }))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const box = screen.getByLabelText("Edit note")
    await user.clear(box)
    await user.type(box, "Changed")
    await user.click(screen.getByRole("button", { name: "Save note" }))

    expect(updateNote).toHaveBeenCalledWith("p1", "n1", { body: "Changed", visibility: "private" })
    await waitFor(() => expect(document.querySelector(".note-body")).toHaveTextContent("Changed"))
    expect(screen.queryByLabelText("Edit note")).toBeNull()
  })

  it("cancels an edit without saving", async () => {
    fetchNotes.mockResolvedValue([note()])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Edit" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(updateNote).not.toHaveBeenCalled()
    expect(screen.getByText("Check the calibration")).toBeInTheDocument()
  })

  it("shares a private note and makes it private again", async () => {
    fetchNotes.mockResolvedValue([note()])
    updateNote.mockResolvedValueOnce(note({ visibility: "shared" })).mockResolvedValueOnce(note())
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Share with the team" }))
    expect(updateNote).toHaveBeenLastCalledWith("p1", "n1", { visibility: "shared" })
    await user.click(await screen.findByRole("button", { name: "Make private" }))
    expect(updateNote).toHaveBeenLastCalledWith("p1", "n1", { visibility: "private" })
  })

  it("pins a note to the top", async () => {
    fetchNotes.mockResolvedValue([
      note({ id: "a", body: "Older", updated_at: "2026-10-08T08:00:00Z" }),
      note({ id: "b", body: "Newer", updated_at: "2026-10-09T09:00:00Z" }),
    ])
    updateNote.mockResolvedValue(note({ id: "a", body: "Older", pinned: true, updated_at: "2026-10-08T08:00:00Z" }))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Older")

    await user.click(within(screen.getByText("Older").closest("li")).getByRole("button", { name: "Pin" }))

    await waitFor(() => {
      const bodies = screen.getAllByRole("listitem").map((item) => item.querySelector(".note-body").textContent)
      expect(bodies).toEqual(["Older", "Newer"])
    })
    expect(screen.getByText("Pinned")).toBeInTheDocument()
  })

  it("deletes only after confirming", async () => {
    fetchNotes.mockResolvedValue([note()])
    deleteNote.mockResolvedValue(null)
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Delete" }))
    expect(deleteNote).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Delete" }))

    expect(deleteNote).toHaveBeenCalledWith("p1", "n1")
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it("lets the owner delete a shared note without offering to edit it", async () => {
    fetchNotes.mockResolvedValue([
      note({ visibility: "shared", mine: false, can_edit: false, can_delete: true, author: { user_id: "u2", full_name: "Sam Dube" } }),
    ])
    render(<ProjectNotes projectId="p1" />)

    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
  })

  it("reports a failed action on the note it belongs to", async () => {
    fetchNotes.mockResolvedValue([note()])
    updateNote.mockRejectedValue(new Error("Only the author can change a note"))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Pin" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Only the author can change a note")
  })

  it("reports a failed delete", async () => {
    fetchNotes.mockResolvedValue([note()])
    deleteNote.mockRejectedValue(new Error("You cannot delete this note"))
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    await user.click(await screen.findByRole("button", { name: "Delete" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("You cannot delete this note")
    expect(screen.getByText("Check the calibration")).toBeInTheDocument()
  })

  it("filters between private and shared notes", async () => {
    fetchNotes.mockResolvedValue([
      note({ id: "a", body: "Private one" }),
      note({ id: "b", body: "Shared one", visibility: "shared" }),
    ])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Private one")

    await user.click(screen.getByRole("button", { name: "Shared" }))
    expect(screen.queryByText("Private one")).toBeNull()
    expect(screen.getByText("Shared one")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Only me" }))
    expect(screen.getByText("Private one")).toBeInTheDocument()
    expect(screen.queryByText("Shared one")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Shared" }))
    await user.click(screen.getByRole("button", { name: "Only me" }))
    expect(screen.getByRole("button", { name: "Only me" })).toHaveAttribute("aria-pressed", "true")
  })

  it("says when a filter matches nothing", async () => {
    fetchNotes.mockResolvedValue([note()])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Check the calibration")

    await user.click(screen.getByRole("button", { name: "Shared" }))

    expect(screen.getByText("No notes of this kind.")).toBeInTheDocument()
  })

  it("offers to try again when the notes cannot be loaded", async () => {
    fetchNotes.mockRejectedValueOnce(new Error("Cannot reach the Chronicles API.")).mockResolvedValueOnce([note()])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the Chronicles API.")
    await user.click(screen.getByRole("button", { name: "Try again" }))

    expect(await screen.findByText("Check the calibration")).toBeInTheDocument()
  })

  it("marks an edited note as edited", async () => {
    fetchNotes.mockResolvedValue([note({ updated_at: "2026-10-10T08:00:00Z" })])
    render(<ProjectNotes projectId="p1" />)

    expect(await screen.findByText(/^Edited /)).toBeInTheDocument()
  })
  it("searches on the server after a short pause, not on every keystroke", async () => {
    fetchNotes.mockResolvedValueOnce([note({ body: "Other" }), note({ id: "b", body: "Centrifuge" })])
    fetchNotes.mockResolvedValueOnce([note({ id: "b", body: "Centrifuge" })])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Other")
    expect(fetchNotes).toHaveBeenLastCalledWith("p1", "")

    const box = screen.getByLabelText("Search notes")
    await user.type(box, "cent")
    await user.type(box, "r")

    await waitFor(() => expect(fetchNotes).toHaveBeenLastCalledWith("p1", "centr"))
    expect(fetchNotes).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByText("Other")).toBeNull())
    expect(screen.getByText("Centrifuge")).toBeInTheDocument()
  })

  it("says what was searched for when nothing matches", async () => {
    fetchNotes.mockResolvedValueOnce([note()]).mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Check the calibration")

    await user.type(screen.getByLabelText("Search notes"), "zebra")

    expect(await screen.findByText("No notes match “zebra”.")).toBeInTheDocument()
  })

  it("asks the server again after adding a note while a search is active", async () => {
    fetchNotes.mockResolvedValue([note({ body: "Alpha" })])
    createNote.mockResolvedValue(note({ id: "new", body: "Beta" }))
    const user = userEvent.setup()
    render(<ProjectNotes projectId="p1" />)
    await screen.findByText("Alpha")
    await user.type(screen.getByLabelText("Search notes"), "alp")
    await waitFor(() => expect(fetchNotes).toHaveBeenLastCalledWith("p1", "alp"))
    const before = fetchNotes.mock.calls.length

    await user.type(screen.getByLabelText("New note"), "Beta")
    await user.click(screen.getByRole("button", { name: "Add note" }))

    await waitFor(() => expect(fetchNotes.mock.calls.length).toBe(before + 1))
  })
})
