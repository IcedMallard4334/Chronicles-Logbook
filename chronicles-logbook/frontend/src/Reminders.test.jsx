/**
 * The reminders bell (US-3.12): overdue, due-today and upcoming work across
 * every project, raised without the user having to go looking for it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchReminders: vi.fn(),
}))

import Reminders from "./Reminders"
import { fetchReminders } from "./api"

const item = (overrides) => ({
  kind: "entry",
  id: "e1",
  project_id: "p1",
  project_name: "Thesis",
  title: "Submit chapter 2",
  due_date: "2026-09-25",
  status: "overdue",
  days_until: -2,
  ...overrides,
})

const summary = (items, extra = {}) => ({
  today: "2026-09-27",
  within_days: 7,
  overdue_count: items.filter((i) => i.status === "overdue").length,
  due_today_count: items.filter((i) => i.status === "due_today").length,
  upcoming_count: items.filter((i) => i.status === "upcoming").length,
  occurrences_created: 0,
  items,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  fetchReminders.mockResolvedValue(
    summary([
      item(),
      item({ id: "t1", kind: "task", title: "Book the venue", status: "due_today", days_until: 0 }),
      item({ id: "e2", title: null, status: "upcoming", days_until: 3, project_name: "Garden" }),
    ])
  )
})

describe("the reminders bell", () => {
  it("is not there when nothing is due", async () => {
    fetchReminders.mockResolvedValue(summary([]))
    const { container } = render(<Reminders />)

    await waitFor(() => expect(fetchReminders).toHaveBeenCalledWith(7))
    expect(container.querySelector(".reminders")).toBeNull()
  })

  it("counts what needs attention now, and names it for screen readers", async () => {
    render(<Reminders />)

    const bell = await screen.findByRole("button", { name: "Reminders: 1 overdue, 1 due today, 1 coming up" })
    expect(bell).toHaveTextContent("2")
    expect(bell.querySelector(".reminders-count")).toHaveClass("reminders-count--overdue")
  })

  it("groups items and says how late each one is in words", async () => {
    render(<Reminders />)

    fireEvent.click(await screen.findByRole("button", { name: /Reminders:/ }))

    const panel = screen.getByRole("dialog", { name: "Reminders" })
    expect(panel).toHaveTextContent("Overdue")
    expect(panel).toHaveTextContent("Submit chapter 2")
    expect(panel).toHaveTextContent("2 days late")
    expect(panel).toHaveTextContent("Task · Thesis")
    expect(panel).toHaveTextContent("today")
    expect(panel).toHaveTextContent("Untitled entry")
    expect(panel).toHaveTextContent("in 3 days")
  })

  it("opens the project a reminder belongs to", async () => {
    const onOpenProject = vi.fn()
    render(<Reminders onOpenProject={onOpenProject} />)

    fireEvent.click(await screen.findByRole("button", { name: /Reminders:/ }))
    fireEvent.click(screen.getByRole("button", { name: /Book the venue/ }))

    expect(onOpenProject).toHaveBeenCalledWith("p1")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("shows upcoming-only reminders in the quieter colour", async () => {
    fetchReminders.mockResolvedValue(summary([item({ status: "upcoming", days_until: 1 })]))
    render(<Reminders />)

    const bell = await screen.findByRole("button", { name: "Reminders: 1 coming up" })
    expect(bell.querySelector(".reminders-count")).toHaveClass("reminders-count--upcoming")
  })

  it("tells the workspace when recurring entries were created", async () => {
    fetchReminders.mockResolvedValue(summary([item()], { occurrences_created: 2 }))
    const onOccurrencesCreated = vi.fn()
    render(<Reminders onOccurrencesCreated={onOccurrencesCreated} />)

    await waitFor(() => expect(onOccurrencesCreated).toHaveBeenCalledTimes(1))
  })

  it("checks again when the tab regains focus", async () => {
    render(<Reminders />)
    await waitFor(() => expect(fetchReminders).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event("focus"))

    await waitFor(() => expect(fetchReminders).toHaveBeenCalledTimes(2))
  })

  it("stays out of the way if reminders can't be loaded", async () => {
    fetchReminders.mockRejectedValue(new Error("offline"))
    const { container } = render(<Reminders />)

    await waitFor(() => expect(fetchReminders).toHaveBeenCalled())
    expect(container.querySelector(".reminders")).toBeNull()
  })
})
