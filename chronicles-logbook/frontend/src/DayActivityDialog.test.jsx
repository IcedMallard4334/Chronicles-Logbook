import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  createCalendarActivity: vi.fn(),
  updateCalendarActivity: vi.fn(),
  deleteCalendarActivity: vi.fn(),
}))

import { updateCalendarActivity } from "./api"
import DayActivityDialog from "./DayActivityDialog"

const activity = { id: "a1", title: "Standup", description: "", day: "2026-09-30", all_day: false, start_time: "09:00", end_time: "09:30" }
const entry = { id: "e1", project_id: "p1", project_name: "Operations", created_at: "2026-09-30T10:00:00" }

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", "") })
  HTMLDialogElement.prototype.close = vi.fn()
})

function renderDialog(props = {}) {
  return render(
    <DayActivityDialog date={new Date(2026, 8, 30)} events={[]} entries={[entry]} activities={[activity]} loading={false} onClose={vi.fn()} onSaved={vi.fn()} onUpdated={vi.fn()} onDeleted={vi.fn()} {...props} />
  )
}

describe("DayActivityDialog management", () => {
  it("edits an activity in place", async () => {
    updateCalendarActivity.mockResolvedValue({ ...activity, title: "Standup v2" })
    const onUpdated = vi.fn()
    renderDialog({ onUpdated })

    fireEvent.click(screen.getByRole("button", { name: "Edit activity Standup" }))
    fireEvent.change(screen.getByLabelText("Activity title"), { target: { value: "Standup v2" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(updateCalendarActivity).toHaveBeenCalledWith("a1", expect.objectContaining({ title: "Standup v2", day: "2026-09-30" })))
    expect(onUpdated).toHaveBeenCalledWith({ ...activity, title: "Standup v2" })
  })

  it("opens a logbook entry for editing or deleting", () => {
    const onOpenEntry = vi.fn()
    renderDialog({ onOpenEntry })

    fireEvent.click(screen.getByRole("button", { name: "Open entry from Operations" }))

    expect(onOpenEntry).toHaveBeenCalledWith(entry)
  })

  it("offers to edit and delete a project that has entries that day, for its owner only", () => {
    const onEditProject = vi.fn()
    renderDialog({ onEditProject, canManageProject: (id) => id === "p1", renderProjectDelete: (id) => <button type="button">Delete project {id}</button> })

    fireEvent.click(screen.getByRole("button", { name: "Edit project Operations" }))
    expect(onEditProject).toHaveBeenCalledWith("p1")
    expect(screen.getByRole("button", { name: "Delete project p1" })).toBeInTheDocument()
  })

  it("hides project controls for projects the person does not own", () => {
    renderDialog({ onEditProject: vi.fn(), canManageProject: () => false })
    expect(screen.queryByRole("button", { name: /Edit project/ })).not.toBeInTheDocument()
  })
})
