import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createCustomStatistic,
  deleteCustomStatistic,
  fetchCustomStatistics,
  fetchFieldStatistics,
  fetchStatistics,
  fetchStatisticsActivity,
  fetchStatisticsLayout,
  previewCustomStatistic,
  saveStatisticsLayout,
  updateCustomStatistic,
} from "./api"
import StatisticsPage from "./StatisticsPage"

vi.mock("./api", () => ({
  fetchStatistics: vi.fn(),
  fetchStatisticsActivity: vi.fn(),
  fetchStatisticsLayout: vi.fn(),
  saveStatisticsLayout: vi.fn(),
  // "Look inside a project" and "A field over time" reuse panels that fetch
  // their own content through this same mocked module.
  fetchFieldStatistics: vi.fn(),
  fetchFieldTimeline: vi.fn(),
  // US-3.8: the My stats panel and its sentence builder.
  fetchCustomStatistics: vi.fn(),
  previewCustomStatistic: vi.fn(),
  createCustomStatistic: vi.fn(),
  updateCustomStatistic: vi.fn(),
  deleteCustomStatistic: vi.fn(),
}))

// Recharts' ResponsiveContainer measures itself with a ResizeObserver, which
// jsdom does not implement. A no-op is enough for the charts to mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

const project = {
  id: "proj-1",
  name: "Lab practicals",
  archived: false,
  schema_version: 1,
  entry_schema: [
    { id: "hours", name: "Hours", type: "number" },
    { id: "notes", name: "Notes", type: "text" },
  ],
  retired_schema: [],
}

const savedStat = {
  id: "stat-1",
  project_id: "proj-1",
  project_name: "Lab practicals",
  name: "Average hours",
  expression: "avg({Hours})",
  description: "Average of Hours",
  value: 2.5,
  entries_used: 128,
  note: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
}

const statistics = {
  totals: {
    projects: 1, active_projects: 1, archived_projects: 0,
    entries: 128, time_spent: 200, active_days: 47,
    current_streak: 6, longest_streak: 19,
    first_entry_at: "2026-01-04T08:12:00Z", last_entry_at: "2026-09-10T17:40:00Z",
  },
  projects: [
    {
      project_id: "proj-1", name: "Lab practicals", archived: false,
      entries: 128, time_spent: 200, active_days: 40,
      first_entry_at: "2026-01-04T08:12:00Z", last_entry_at: "2026-09-10T17:40:00Z",
    },
  ],
}

const activity = {
  weeks: [
    { week_start: "2026-09-14", entries: 8, time_spent: 180 },
    { week_start: "2026-09-21", entries: 4, time_spent: 120 },
  ],
  busiest_weekday: "Tuesday",
}

const defaultLayout = [
  { id: "cards", visible: true },
  { id: "time", visible: true },
  { id: "activity", visible: true },
  { id: "custom", visible: true },
  { id: "fields", visible: true },
  { id: "trend", visible: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchStatistics.mockResolvedValue(statistics)
  fetchStatisticsActivity.mockResolvedValue(activity)
  fetchStatisticsLayout.mockResolvedValue(defaultLayout)
  fetchFieldStatistics.mockResolvedValue({ project_id: "proj-1", schema_version: 1, fields: [] })
  // The server echoes the saved arrangement back, and the page re-renders from
  // that response, so the mock echoes its argument the same way.
  saveStatisticsLayout.mockImplementation((panels) => Promise.resolve(panels))
  fetchCustomStatistics.mockResolvedValue([])
  previewCustomStatistic.mockResolvedValue({ value: 2.5, entries_used: 128, note: null })
  createCustomStatistic.mockImplementation((payload) => Promise.resolve({ ...savedStat, ...payload }))
  updateCustomStatistic.mockImplementation((id, payload) => Promise.resolve({ ...savedStat, id, ...payload }))
  deleteCustomStatistic.mockResolvedValue(null)
})

describe("StatisticsPage", () => {
  it("shows the headline numbers, with time in hours and minutes", async () => {
    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)

    const cards = await screen.findByLabelText("Headline cards")
    expect(within(cards).getByText("3h 20m")).toBeInTheDocument()
    expect(within(cards).getByText("128")).toBeInTheDocument()
    expect(within(cards).getByText("47")).toBeInTheDocument()
    expect(within(cards).getByText("6")).toBeInTheDocument()
    expect(within(cards).getByText("Best: 19 days")).toBeInTheDocument()

    // The "?" explains a card in one plain sentence when asked.
    fireEvent.click(within(cards).getByRole("button", { name: "What is time logged?" }))
    expect(
      within(cards).getByText("The time you have recorded across every entry, in hours and minutes."),
    ).toBeInTheDocument()
  })

  it("shows the starting-out page instead of charts when nothing is logged", async () => {
    fetchStatistics.mockResolvedValue({
      totals: {
        projects: 1, active_projects: 1, archived_projects: 0,
        entries: 0, time_spent: 0, active_days: 0,
        current_streak: 0, longest_streak: 0,
        first_entry_at: null, last_entry_at: null,
      },
      projects: [],
    })
    const onNavigate = vi.fn()

    render(<StatisticsPage projects={[project]} onNavigate={onNavigate} />)

    expect(await screen.findByText("Your stats will appear here")).toBeInTheDocument()
    expect(screen.queryByLabelText("Time logged per project")).not.toBeInTheDocument()
    // Step one is already ticked, because a project exists.
    expect(screen.getByText("Create a project").closest("li")).toHaveClass("is-done")
    expect(screen.getByText("Log your first entry and add how long it took")).toBeInTheDocument()
    expect(screen.getByText("Come back tomorrow to start a streak")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Go to Projects" }))
    expect(onNavigate).toHaveBeenCalledWith("home")
  })

  it("hides a panel from the Customise drawer and saves the new arrangement", async () => {
    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    await screen.findByRole("heading", { name: "Where your time went" })

    fireEvent.click(screen.getByRole("button", { name: "Customise" }))
    const drawer = await screen.findByRole("dialog")

    fireEvent.click(within(drawer).getByLabelText("Where your time went"))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save layout" }))

    await waitFor(() => expect(saveStatisticsLayout).toHaveBeenCalledTimes(1))
    expect(saveStatisticsLayout).toHaveBeenCalledWith(
      defaultLayout.map((panel) => (panel.id === "time" ? { ...panel, visible: false } : panel)),
    )

    // Once the saved arrangement applies, the panel is gone from the page and
    // the drawer has closed.
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Where your time went" })).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("reorders panels from the Customise drawer and renders them in that order", async () => {
    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    await screen.findByRole("heading", { name: "Where your time went" })

    fireEvent.click(screen.getByRole("button", { name: "Customise" }))
    const drawer = await screen.findByRole("dialog")

    // "Your activity" starts third; moving it up twice puts it above the cards.
    fireEvent.click(within(drawer).getByRole("button", { name: "Move Your activity up" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Move Your activity up" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Save layout" }))

    await waitFor(() => expect(saveStatisticsLayout).toHaveBeenCalledWith([
      { id: "activity", visible: true },
      { id: "cards", visible: true },
      { id: "time", visible: true },
      { id: "custom", visible: true },
      { id: "fields", visible: true },
      { id: "trend", visible: false },
    ]))

    await waitFor(() => {
      const activityHeading = screen.getByRole("heading", { name: "Your activity" })
      const cardsHeading = screen.getByRole("heading", { name: "Headline cards" })
      expect(
        activityHeading.compareDocumentPosition(cardsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  it("explains when the numbers cannot be loaded, and retries", async () => {
    fetchStatistics.mockRejectedValue(new Error("Statistics unavailable"))

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Statistics unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(fetchStatistics).toHaveBeenCalledTimes(2))
  })

  it("shows the stats you have saved, each with the number it works out to", async () => {
    // A stat whose field the schema has moved on from still shows, with the
    // reason it cannot produce a number rather than a blank.
    fetchCustomStatistics.mockResolvedValue([
      savedStat,
      {
        ...savedStat,
        id: "stat-2",
        name: "Old figure",
        description: "Total of Cost",
        value: null,
        note: "There's no field called 'hours' in Lab practicals.",
      },
    ])

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)

    const panel = await screen.findByLabelText("My stats")
    await within(panel).findByText("Average of Hours · Lab practicals")
    expect(within(panel).getByText("Average hours")).toBeInTheDocument()
    expect(within(panel).getByText("2.5")).toBeInTheDocument()
    expect(within(panel).getByText("—")).toBeInTheDocument()
    expect(within(panel).getByText("There's no field called 'hours' in Lab practicals.")).toBeInTheDocument()
  })

  it("invites you to make a stat when you have none yet", async () => {
    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)

    const panel = await screen.findByLabelText("My stats")
    expect(
      await within(panel).findByText("No stats of your own yet. Make one from any project's numbers."),
    ).toBeInTheDocument()
  })

  it("builds a stat from the sentence, previews it live, and saves it", async () => {
    // The first load has nothing saved; the reload after saving has the card.
    fetchCustomStatistics.mockResolvedValueOnce([]).mockResolvedValue([savedStat])

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    await screen.findByRole("heading", { name: "Where your time went" })

    fireEvent.click(screen.getByRole("button", { name: "Make your own stat" }))
    const dialog = screen.getByRole("dialog")

    // The sentence starts as the Average of the project's first number field.
    await waitFor(() =>
      expect(previewCustomStatistic).toHaveBeenCalledWith("proj-1", "avg({Hours})"),
    )
    expect(await within(dialog).findByText("2.5")).toBeInTheDocument()
    expect(within(dialog).getByText("across 128 entries")).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Average hours" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save stat" }))

    await waitFor(() =>
      expect(createCustomStatistic).toHaveBeenCalledWith({
        project_id: "proj-1",
        name: "Average hours",
        expression: "avg({Hours})",
      }),
    )

    // Saving closes the dialog and reloads the list, so the card appears.
    expect(await screen.findByText("Average of Hours · Lab practicals")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("explains, inline, why a formula cannot be worked out", async () => {
    previewCustomStatistic.mockImplementation((projectId, expression) =>
      expression.includes("Hurs")
        ? Promise.reject(
            new Error("There's no field called 'Hurs' in Lab practicals. Did you mean 'Hours'?"),
          )
        : Promise.resolve({ value: 2.5, entries_used: 128, note: null }),
    )

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    await screen.findByRole("heading", { name: "Where your time went" })

    fireEvent.click(screen.getByRole("button", { name: "Make your own stat" }))
    const dialog = screen.getByRole("dialog")

    // The advanced toggle swaps the sentence for a formula written by hand.
    fireEvent.click(within(dialog).getByRole("button", { name: "Advanced: write a formula" }))
    expect(within(dialog).getByLabelText("Formula")).toHaveValue("avg({Hours})")

    fireEvent.change(within(dialog).getByLabelText("Formula"), {
      target: { value: "avg({Hurs})" },
    })

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Did you mean 'Hours'?")
  })

  it("reopens a saved stat in the builder and saves the rework", async () => {
    fetchCustomStatistics.mockResolvedValue([savedStat])

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    const panel = await screen.findByLabelText("My stats")
    await within(panel).findByText("Average hours")
    fireEvent.click(within(panel).getByRole("button", { name: "Edit" }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("heading", { name: "Edit your stat" })).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Average hours")

    fireEvent.change(within(dialog).getByLabelText("What to show"), { target: { value: "Total" } })
    await waitFor(() =>
      expect(previewCustomStatistic).toHaveBeenCalledWith("proj-1", "sum({Hours})"),
    )

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(updateCustomStatistic).toHaveBeenCalledWith("stat-1", {
        name: "Average hours",
        expression: "sum({Hours})",
      }),
    )
  })

  it("reopens a hand-written formula as a formula rather than a sentence", async () => {
    fetchCustomStatistics.mockResolvedValue([
      { ...savedStat, expression: "sum({Hours}) / count()" },
    ])

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    const panel = await screen.findByLabelText("My stats")
    await within(panel).findByText("Average hours")
    fireEvent.click(within(panel).getByRole("button", { name: "Edit" }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByLabelText("Formula")).toHaveValue("sum({Hours}) / count()")

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() =>
      expect(updateCustomStatistic).toHaveBeenCalledWith("stat-1", {
        name: "Average hours",
        expression: "sum({Hours}) / count()",
      }),
    )
  })

  it("deletes a saved stat from its card", async () => {
    fetchCustomStatistics.mockResolvedValueOnce([savedStat]).mockResolvedValue([])

    render(<StatisticsPage projects={[project]} onNavigate={vi.fn()} />)
    const panel = await screen.findByLabelText("My stats")
    await within(panel).findByText("Average hours")

    fireEvent.click(within(panel).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(deleteCustomStatistic).toHaveBeenCalledWith("stat-1"))
    await waitFor(() =>
      expect(screen.queryByText("Average of Hours · Lab practicals")).not.toBeInTheDocument(),
    )
  })
})
