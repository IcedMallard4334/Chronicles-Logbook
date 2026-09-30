import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchCalendarActivities: vi.fn(),
  createCalendarActivity: vi.fn(),
  updateCalendarActivity: vi.fn(),
  deleteCalendarActivity: vi.fn(),
}))

import { createCalendarActivity, deleteCalendarActivity, fetchCalendarActivities, updateCalendarActivity } from "./api"
import ActivitiesPage from "./ActivitiesPage"

const key = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const activity = (id, title, offset, over = {}) => ({ id, title, description: "", day: key(offset), all_day: false, start_time: "09:00", end_time: "10:00", ...over })

beforeEach(() => {
  vi.clearAllMocks()
  fetchCalendarActivities.mockResolvedValue([activity("a1", "Standup", 2), activity("a2", "Old review", -3, { all_day: true, start_time: null, end_time: null })])
})

describe("ActivitiesPage", () => {
  it("lists activities added from the calendar, split into upcoming and earlier", async () => {
    render(<ActivitiesPage />)

    const upcoming = await screen.findByRole("region", { name: "Upcoming" })
    expect(within(upcoming).getByText("Standup")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Earlier" })).getByText("Old review")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Earlier" })).getByText("All day")).toBeInTheDocument()
  })

  it("adds an activity on a chosen date", async () => {
    createCalendarActivity.mockImplementation(async (payload) => ({ id: "new", description: "", ...payload }))
    render(<ActivitiesPage />)
    fireEvent.click(await screen.findByRole("button", { name: "+ Add activity" }))

    fireEvent.change(screen.getByLabelText("Activity title"), { target: { value: "Demo prep" } })
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: key(5) } })
    fireEvent.click(screen.getByRole("button", { name: "Save activity" }))

    await waitFor(() => expect(createCalendarActivity).toHaveBeenCalledWith(expect.objectContaining({ title: "Demo prep", day: key(5), start_time: "09:00", end_time: "10:00" })))
    expect(await screen.findByText("Demo prep")).toBeInTheDocument()
  })

  it("edits an activity, including moving it to another day", async () => {
    updateCalendarActivity.mockImplementation(async (id, payload) => ({ id, description: "", ...payload }))
    render(<ActivitiesPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit activity Standup" }))

    fireEvent.change(screen.getByLabelText("Activity title"), { target: { value: "Standup (moved)" } })
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: key(4) } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateCalendarActivity).toHaveBeenCalledWith("a1", expect.objectContaining({ title: "Standup (moved)", day: key(4) })))
    expect(await screen.findByText("Standup (moved)")).toBeInTheDocument()
    expect(screen.queryByText("Standup")).not.toBeInTheDocument()
  })

  it("asks before deleting, and deletes on confirmation", async () => {
    deleteCalendarActivity.mockResolvedValue(null)
    render(<ActivitiesPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Delete activity Standup" }))

    expect(deleteCalendarActivity).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(deleteCalendarActivity).toHaveBeenCalledWith("a1"))
    await waitFor(() => expect(screen.queryByText("Standup")).not.toBeInTheDocument())
  })

  it("rejects an end time that is not after the start", async () => {
    render(<ActivitiesPage />)
    fireEvent.click(await screen.findByRole("button", { name: "+ Add activity" }))
    fireEvent.change(screen.getByLabelText("Activity title"), { target: { value: "X" } })
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "08:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Save activity" }))

    expect(await screen.findByText("End time must be after start time.")).toBeInTheDocument()
    expect(createCalendarActivity).not.toHaveBeenCalled()
  })

  it("reports a load failure and can retry", async () => {
    fetchCalendarActivities.mockRejectedValueOnce(new Error("Offline"))
    render(<ActivitiesPage />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("Standup")).toBeInTheDocument()
  })
})
