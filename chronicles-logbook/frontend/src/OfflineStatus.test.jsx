import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import OfflineStatus from "./OfflineStatus"
import { createMemoryAdapter, createOfflineQueue } from "./offlineQueue"
import { createSyncEngine } from "./offlineSync"

const USER = "user-1"

const project = {
  id: "proj-1",
  name: "Field Notes",
  entry_schema: [
    { id: "note", name: "Note", type: "text" },
    { id: "pages", name: "Pages", type: "number" },
  ],
}

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

let queue
let engine
let createEntry

beforeEach(() => {
  queue = createOfflineQueue(createMemoryAdapter())
  createEntry = vi.fn().mockResolvedValue({ id: "server-id" })
  engine = createSyncEngine({ queue, createEntry })
  setOnline(true)
})

function setOnline(value) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  })
}

function renderStatus() {
  return render(
    <OfflineStatus userId={USER} projects={[project]} queue={queue} engine={engine} />
  )
}

async function queueEntry(overrides = {}) {
  return queue.enqueue({
    userId: USER,
    projectId: project.id,
    data: { note: "Wiring the sensor rig", pages: 12 },
    timeSpent: 30,
    ...overrides,
  })
}

describe("the status pill", () => {
  it("stays hidden when online with nothing queued", async () => {
    const { container } = renderStatus()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it("appears when the connection drops", async () => {
    renderStatus()

    setOnline(false)
    fireEvent(window, new Event("offline"))

    expect(await screen.findByText("Offline")).toBeInTheDocument()
  })

  it("shows the pending count while offline, not just the connection state", async () => {
    // Offline is when the number matters most — being told only "Offline"
    // while three entries are banked up is the least useful moment for it.
    await queueEntry()
    await queueEntry({ data: { note: "second" } })

    renderStatus()
    setOnline(false)
    fireEvent(window, new Event("offline"))

    expect(await screen.findByText("Offline · 2 waiting")).toBeInTheDocument()
  })

  it("shows how much work is waiting to sync", async () => {
    await queueEntry()
    await queueEntry({ data: { note: "second" } })

    renderStatus()

    expect(await screen.findByText("2 waiting")).toBeInTheDocument()
  })

  it("calls out entries that need the user's attention", async () => {
    const record = await queueEntry()
    await queue.markRejected(record.id, "Unknown field: notes")

    renderStatus()

    expect(await screen.findByText("1 needs attention")).toBeInTheDocument()
  })
})

describe("the review panel", () => {
  async function openPanelWithRejection(reason = "Unknown field: notes") {
    const record = await queueEntry()
    await queue.markRejected(record.id, reason)
    renderStatus()
    fireEvent.click(await screen.findByText("1 needs attention"))
    return record
  }

  it("shows what was captured and why it was refused", async () => {
    await openPanelWithRejection("Missing required field: Status")

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Missing required field: Status")).toBeInTheDocument()
    expect(within(dialog).getByText("Field Notes")).toBeInTheDocument()
    // Field ids are resolved to their labels from the project's schema.
    expect(within(dialog).getByText("Note")).toBeInTheDocument()
    expect(within(dialog).getByText("Wiring the sensor rig")).toBeInTheDocument()
  })

  it("retries an entry unchanged", async () => {
    await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    await waitFor(async () => expect(await queue.rejected(USER)).toHaveLength(0))
  })

  it("lets the user correct the entry and send it again", async () => {
    // The schema-drift case: the values no longer fit, so retrying unchanged
    // would fail identically. The user edits against the current schema.
    await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Corrected note" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save and retry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    expect(createEntry.mock.calls[0][1].data).toEqual({
      note: "Corrected note",
      pages: 12,
    })
  })

  it("sends number fields as numbers after an edit", async () => {
    // Text inputs yield strings; sending "13" where the schema wants a number
    // would be refused a second time.
    await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Pages"), { target: { value: "13" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and retry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
    expect(createEntry.mock.calls[0][1].data.pages).toBe(13)
  })

  it("asks before discarding, because it is the only copy", async () => {
    const record = await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))

    expect(screen.getByText(/only copy/i)).toBeInTheDocument()
    // Still there until confirmed.
    expect(await queue.get(record.id)).not.toBeNull()
  })

  it("keeps the entry when the user backs out of discarding", async () => {
    const record = await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))

    expect(await queue.get(record.id)).not.toBeNull()
  })

  it("discards only once confirmed", async () => {
    const record = await openPanelWithRejection()

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Discard" })[0])

    await waitFor(async () => expect(await queue.get(record.id)).toBeNull())
  })

  it("explains when the entry's project no longer exists", async () => {
    const record = await queue.enqueue({
      userId: USER,
      projectId: "deleted-project",
      data: { note: "orphaned" },
    })
    await queue.markRejected(record.id, "Project not found")

    render(
      <OfflineStatus userId={USER} projects={[]} queue={queue} engine={engine} />
    )
    fireEvent.click(await screen.findByText("1 needs attention"))
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))

    expect(
      screen.getByText(/no longer exists, so the entry cannot be edited/i)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save and retry" })).toBeDisabled()
  })

  it("offers a manual sync while work is still pending", async () => {
    await queueEntry()
    renderStatus()

    fireEvent.click(await screen.findByText("1 waiting"))
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
  })

  it("does not offer a manual sync while offline", async () => {
    await queueEntry()
    renderStatus()
    setOnline(false)
    fireEvent(window, new Event("offline"))

    fireEvent.click(await screen.findByText("Offline"))

    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument()
  })

  it("surfaces a rejection that happens during a retry", async () => {
    await openPanelWithRejection()
    createEntry.mockRejectedValue(httpError("Cannot add entries to an archived project.", 409))

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }))

    expect(
      await screen.findByText("Cannot add entries to an archived project.")
    ).toBeInTheDocument()
  })
})
