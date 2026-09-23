import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import CalendarView from "./CalendarView"
import {
  disconnectGoogleCalendar,
  fetchCalendarActivities,
  fetchEntriesGlobal,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendarEvents,
  fetchGoogleCalendarStatus,
} from "./api"

vi.mock("./api", () => ({
  disconnectGoogleCalendar: vi.fn(),
  fetchCalendarActivities: vi.fn(),
  fetchEntriesGlobal: vi.fn(),
  fetchGoogleCalendarAuthUrl: vi.fn(),
  fetchGoogleCalendarEvents: vi.fn(),
  fetchGoogleCalendarStatus: vi.fn(),
}))

// The day dialog is a separate feature with its own API calls; stubbing it
// keeps these tests about the month grid and the day it has selected.
vi.mock("./DayActivityDialog", () => ({
  default: ({ date, entries, onClose }) => (
    <div role="dialog" aria-label={`Day ${date.getDate()}`}>
      <span>{entries.length} entries in dialog</span>
      <button type="button" onClick={onClose}>
        Close day
      </button>
    </div>
  ),
}))

// August 2026 begins on a Saturday, so its grid runs 26 July – 5 September.
const NOW = new Date(2026, 7, 15, 9, 0, 0)
const MONTH_START = "2026-07-26"
const MONTH_END = "2026-09-05"

const monthHeading = (date) => date.toLocaleDateString(undefined, { month: "long", year: "numeric" })

const dayLabel = (date, google = 0, logs = 0, activities = 0) =>
  `${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${google} Google events, ${logs} logbook entries, ${activities} activities`

const entry = (id, date, overrides = {}) => ({
  id,
  project_id: "p1",
  project_name: "Operations",
  data: { "field-1": "Reviewed the plan" },
  created_at: date.toISOString(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  fetchGoogleCalendarStatus.mockResolvedValue({ accounts: [] })
  fetchEntriesGlobal.mockResolvedValue([])
  fetchGoogleCalendarEvents.mockResolvedValue([])
  fetchCalendarActivities.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CalendarView", () => {
  it("opens on the current month as six complete weeks", async () => {
    render(<CalendarView />)

    expect(screen.getByRole("heading", { name: monthHeading(NOW) })).toBeInTheDocument()
    const grid = screen.getByLabelText("Month dates")
    // Six rows of seven keeps the grid the same height all year, so the page
    // does not jump when the month changes.
    expect(grid.querySelectorAll("button")).toHaveLength(42)
    await waitFor(() =>
      expect(fetchCalendarActivities).toHaveBeenCalledWith({ start: MONTH_START, end: MONTH_END }),
    )
  })

  it("marks today and starts with today selected", async () => {
    render(<CalendarView />)

    const today = screen.getByRole("button", { name: dayLabel(NOW) })
    expect(today).toHaveAttribute("aria-current", "date")
    expect(today).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenCalled())
  })

  it("reads every page of entries rather than only the first", async () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      entry(`a${index}`, new Date(2026, 7, 3, 10)),
    )
    fetchEntriesGlobal.mockResolvedValueOnce(first).mockResolvedValueOnce([
      entry("b1", new Date(2026, 7, 4, 10)),
    ])

    render(<CalendarView />)

    // A full page means there may be more, so the view keeps asking until a
    // short page proves it has reached the end.
    await waitFor(() => expect(fetchEntriesGlobal).toHaveBeenCalledTimes(2))
    expect(fetchEntriesGlobal).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 })
    expect(fetchEntriesGlobal).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 })
  })

  it("places a logbook entry on the day it was recorded", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1", new Date(2026, 7, 12, 14, 30))])

    render(<CalendarView />)

    expect(
      await screen.findByRole("button", { name: dayLabel(new Date(2026, 7, 12), 0, 1, 0) }),
    ).toBeInTheDocument()
    expect(screen.getByTitle("Log: Operations")).toBeInTheDocument()
  })

  it("shows the entries for the day that was clicked", async () => {
    fetchEntriesGlobal.mockResolvedValue([
      entry("e1", new Date(2026, 7, 12, 14, 30)),
      entry("e2", new Date(2026, 7, 20, 9, 0)),
    ])

    render(<CalendarView />)
    await screen.findByRole("button", { name: dayLabel(new Date(2026, 7, 12), 0, 1, 0) })

    fireEvent.click(screen.getByRole("button", { name: dayLabel(new Date(2026, 7, 12), 0, 1, 0) }))

    const detail = screen.getByLabelText("Selected date details")
    expect(detail).toHaveTextContent("Reviewed the plan")
    expect(detail).toHaveTextContent("Operations")
    // Only that day's work: the entry three weeks later stays where it is.
    expect(detail.querySelectorAll(".ic-detail-item")).toHaveLength(1)
  })

  it("opens the day dialog with the clicked day's entries", async () => {
    fetchEntriesGlobal.mockResolvedValue([entry("e1", new Date(2026, 7, 12, 14, 30))])

    render(<CalendarView />)
    const day = await screen.findByRole("button", {
      name: dayLabel(new Date(2026, 7, 12), 0, 1, 0),
    })

    fireEvent.click(day)

    expect(screen.getByRole("dialog", { name: "Day 12" })).toBeInTheDocument()
    expect(screen.getByText("1 entries in dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close day" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("says so plainly when a day holds nothing", async () => {
    render(<CalendarView />)

    expect(
      await screen.findByText("No events or logbook entries for this day."),
    ).toBeInTheDocument()
  })

  it("steps to the neighbouring month and reloads that range", async () => {
    render(<CalendarView />)
    await waitFor(() => expect(fetchCalendarActivities).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))

    expect(
      screen.getByRole("heading", { name: monthHeading(new Date(2026, 6, 1)) }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchCalendarActivities).toHaveBeenLastCalledWith({
        start: "2026-06-28",
        end: "2026-08-08",
      }),
    )
  })

  it("returns to the current month from wherever it has wandered", async () => {
    render(<CalendarView />)

    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(
      screen.getByRole("heading", { name: monthHeading(new Date(2026, 9, 1)) }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Today" }))

    expect(screen.getByRole("heading", { name: monthHeading(NOW) })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: dayLabel(NOW) })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await waitFor(() => expect(fetchGoogleCalendarAuthUrl).not.toHaveBeenCalled())
  })

  it("invites a Google connection while there is none", async () => {
    render(<CalendarView />)

    expect(
      await screen.findByRole("button", { name: "Connect Google Calendar" }),
    ).toBeInTheDocument()
    // No account means no point asking Google for events.
    expect(fetchGoogleCalendarEvents).not.toHaveBeenCalled()
  })

  it("shows a Google event alongside a logbook entry on the same day", async () => {
    fetchGoogleCalendarStatus.mockResolvedValue({
      accounts: [{ id: "acc-1", label: "work@example.com" }],
    })
    fetchGoogleCalendarEvents.mockResolvedValue([
      {
        id: "g1",
        summary: "Standup",
        all_day: false,
        start: new Date(2026, 7, 12, 9, 0).toISOString(),
        end: new Date(2026, 7, 12, 9, 30).toISOString(),
      },
    ])
    fetchEntriesGlobal.mockResolvedValue([entry("e1", new Date(2026, 7, 12, 14, 30))])

    render(<CalendarView />)

    const day = await screen.findByRole("button", {
      name: dayLabel(new Date(2026, 7, 12), 1, 1, 0),
    })
    expect(day).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "+ Add Google account" })).toBeInTheDocument()
  })

  it("hides an account's events without disconnecting it", async () => {
    fetchGoogleCalendarStatus.mockResolvedValue({
      accounts: [{ id: "acc-1", label: "work@example.com" }],
    })
    fetchGoogleCalendarEvents.mockResolvedValue([
      {
        id: "g1",
        summary: "Standup",
        all_day: true,
        start: "2026-08-12",
        end: "2026-08-13",
      },
    ])

    render(<CalendarView />)
    await screen.findByRole("button", { name: dayLabel(new Date(2026, 7, 12), 1, 0, 0) })

    fireEvent.click(screen.getByLabelText("work@example.com"))

    expect(
      await screen.findByRole("button", { name: dayLabel(new Date(2026, 7, 12), 0, 0, 0) }),
    ).toBeInTheDocument()
    expect(disconnectGoogleCalendar).not.toHaveBeenCalled()
  })

  it("drops an account and its events once it is disconnected", async () => {
    fetchGoogleCalendarStatus.mockResolvedValue({
      accounts: [{ id: "acc-1", label: "work@example.com" }],
    })
    disconnectGoogleCalendar.mockResolvedValue({})

    render(<CalendarView />)
    const button = await screen.findByRole("button", { name: "Disconnect work@example.com" })

    fireEvent.click(button)

    await waitFor(() => expect(disconnectGoogleCalendar).toHaveBeenCalledWith("acc-1"))
    expect(await screen.findByText("Google Calendar disconnected.")).toBeInTheDocument()
    expect(screen.queryByLabelText("work@example.com")).not.toBeInTheDocument()
  })

  it("names the account whose events could not be fetched", async () => {
    fetchGoogleCalendarStatus.mockResolvedValue({
      accounts: [
        { id: "acc-1", label: "work@example.com" },
        { id: "acc-2", label: "home@example.com" },
      ],
    })
    fetchGoogleCalendarEvents
      .mockRejectedValueOnce(new Error("Token expired"))
      .mockResolvedValue([])

    render(<CalendarView />)

    // One failing account must not hide the other's events, so it is reported
    // by name rather than replacing the whole calendar with an error.
    expect(await screen.findByText("work@example.com: Token expired")).toBeInTheDocument()
    expect(screen.getByLabelText("Month dates")).toBeInTheDocument()
  })

  it("reports activities that could not be loaded", async () => {
    fetchCalendarActivities.mockRejectedValue(new Error("Activities are unavailable"))

    render(<CalendarView />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Activities: Activities are unavailable",
    )
  })

  it("re-reads everything when asked to refresh", async () => {
    render(<CalendarView />)
    const refresh = await screen.findByRole("button", { name: "Refresh" })
    await waitFor(() => expect(refresh).not.toBeDisabled())

    fireEvent.click(refresh)

    await waitFor(() => expect(fetchCalendarActivities).toHaveBeenCalledTimes(2))
    expect(fetchEntriesGlobal).toHaveBeenCalledTimes(2)
  })
})
