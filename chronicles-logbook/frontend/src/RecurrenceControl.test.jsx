/**
 * "Repeat" in an entry's detail view (US-3.12): marking an entry as recurring,
 * changing how, and stopping it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchRecurrence: vi.fn(),
  setRecurrence: vi.fn(),
  stopRecurrence: vi.fn(),
  localDateString: vi.fn(() => "2026-09-27"),
}))

import RecurrenceControl from "./RecurrenceControl"
import { fetchRecurrence, setRecurrence, stopRecurrence } from "./api"

const entry = { id: "e1", due_date: null }

const weekly = {
  id: "rec1",
  entry_id: "e1",
  frequency: "weekly",
  interval: 1,
  starts_on: "2026-09-27",
  ends_on: null,
  next_on: "2026-10-04",
  active: true,
  occurrences_created: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchRecurrence.mockResolvedValue(null)
})

describe("repeating an entry", () => {
  it("says when an entry doesn't repeat", async () => {
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    expect(await screen.findByText("This entry doesn't repeat.")).toBeInTheDocument()
    expect(fetchRecurrence).toHaveBeenCalledWith("p1", "e1")
  })

  it("marks an entry as recurring", async () => {
    setRecurrence.mockResolvedValue({ ...weekly, frequency: "daily", interval: 2 })
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    fireEvent.click(await screen.findByRole("button", { name: "Repeat…" }))
    fireEvent.change(screen.getByLabelText("Every"), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "daily" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(setRecurrence).toHaveBeenCalledWith("p1", "e1", {
        frequency: "daily",
        interval: 2,
        starts_on: "2026-09-27",
        ends_on: null,
      })
    )
    expect(await screen.findByText(/Repeats every 2 days\. Next copy on/)).toBeInTheDocument()
  })

  it("starts from the entry's due date when it has one", async () => {
    render(<RecurrenceControl projectId="p1" entry={{ id: "e1", due_date: "2026-12-01" }} />)

    fireEvent.click(await screen.findByRole("button", { name: "Repeat…" }))

    expect(screen.getByLabelText("Starting from")).toHaveValue("2026-12-01")
  })

  it("refuses an end date before the start", async () => {
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    fireEvent.click(await screen.findByRole("button", { name: "Repeat…" }))
    fireEvent.change(screen.getByLabelText("Until (optional)"), { target: { value: "2026-09-01" } })
    // The browser's own min= check would normally stop this first; submitting
    // the form directly tests the check behind it.
    fireEvent.submit(screen.getByRole("form", { name: "Repeat this entry" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("can't be before the start date")
    expect(setRecurrence).not.toHaveBeenCalled()
  })

  it("shows how an entry repeats, and can stop it", async () => {
    fetchRecurrence.mockResolvedValue({ ...weekly, ends_on: "2026-12-31" })
    stopRecurrence.mockResolvedValue(null)
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    expect(await screen.findByText(/Repeats every week until .*2026\. Next copy on/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop repeating" }))

    await waitFor(() => expect(stopRecurrence).toHaveBeenCalledWith("p1", "e1"))
    expect(await screen.findByText("This entry doesn't repeat.")).toBeInTheDocument()
  })

  it("says when a recurrence has finished", async () => {
    fetchRecurrence.mockResolvedValue({ ...weekly, active: false, next_on: null })
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    expect(await screen.findByText(/It has finished\./)).toBeInTheDocument()
  })

  it("reports a refused save", async () => {
    setRecurrence.mockRejectedValue(new Error("Only the person who wrote an entry can change it."))
    render(<RecurrenceControl projectId="p1" entry={entry} />)

    fireEvent.click(await screen.findByRole("button", { name: "Repeat…" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Only the person who wrote an entry")
  })

  it("is read-only for someone who can't edit the entry, or in an archived project", async () => {
    fetchRecurrence.mockResolvedValue(weekly)
    const { rerender } = render(<RecurrenceControl projectId="p1" entry={entry} canManage={false} />)

    expect(await screen.findByText(/Repeats every week/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull()

    rerender(<RecurrenceControl projectId="p1" entry={entry} archived />)
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull()
  })
})
