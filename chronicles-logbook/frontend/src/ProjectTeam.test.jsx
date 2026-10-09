import { render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ProjectTeam, { activityText, lastActiveText } from "./ProjectTeam"
import { fetchProjectActivity, fetchProjectTeam } from "./api"

vi.mock("./api", () => ({ fetchProjectTeam: vi.fn(), fetchProjectActivity: vi.fn() }))

const stats = (overrides = {}) => ({
  entries_logged: 0,
  entries_completed: 0,
  entries_edited: 0,
  time_logged_minutes: 0,
  tasks_created: 0,
  tasks_completed: 0,
  schema_changes: 0,
  last_active: null,
  ...overrides,
})

const team = {
  project_id: "p1",
  people_working: 2,
  people_invited: 1,
  schema_changes_recorded_since: "2026-10-09T08:00:00Z",
  totals: stats({ entries_logged: 5, entries_completed: 2, tasks_completed: 3, time_logged_minutes: 135 }),
  contributors: [
    {
      user_id: "u1",
      full_name: "Thandi Nkosi",
      email: "thandi@example.com",
      avatar_url: null,
      role: "owner",
      status: null,
      stats: stats({ entries_logged: 3, entries_completed: 1, schema_changes: 2, time_logged_minutes: 75 }),
    },
    {
      user_id: "u2",
      full_name: "Sam Dube",
      email: "sam@example.com",
      avatar_url: "https://example.com/sam.png",
      role: "member",
      status: "accepted",
      stats: stats({ entries_logged: 2, tasks_completed: 3 }),
    },
    { user_id: "u3", full_name: "Lee Moyo", email: "lee@example.com", role: "member", status: "pending", stats: stats() },
    { user_id: "u4", full_name: "Ayo Bello", email: "ayo@example.com", role: "member", status: "declined", stats: stats() },
    { user_id: "u5", full_name: "Kim Park", email: "kim@example.com", role: "former", stats: stats({ entries_logged: 1 }) },
    { user_id: null, full_name: "Author not recorded", role: "unknown", stats: stats({ entries_logged: 1 }) },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchProjectActivity.mockResolvedValue({ project_id: "p1", items: [] })
})

describe("the team drawer", () => {
  it("names the project, says how many are working, and lists everyone with what they have done", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByRole("dialog", { name: "Who is working on Fieldwork" })).toBeInTheDocument()
    expect(screen.getByText("2 people working, 1 invited")).toBeInTheDocument()

    const owner = screen.getByText("Thandi Nkosi").closest("li")
    expect(within(owner).getByText("Owner")).toBeInTheDocument()
    expect(within(owner).getByText("Entries logged").nextSibling).toHaveTextContent("3")
    expect(within(owner).getByText("Schema changes").nextSibling).toHaveTextContent("2")
    expect(within(owner).getByText("Time logged").nextSibling).toHaveTextContent("1h 15m")

    const together = screen.getByRole("region", { name: "Everyone together" })
    expect(within(together).getByText("Tasks completed").nextSibling).toHaveTextContent("3")
    expect(within(together).getByText("Time logged").nextSibling).toHaveTextContent("2h 15m")
  })

  it("says plainly where a person is not yet working, has left, or has no recorded author", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)
    await screen.findByText("Sam Dube")

    expect(within(screen.getByText("Lee Moyo").closest("li")).getByText("Invited")).toBeInTheDocument()
    expect(screen.getByText(/Has not answered the invitation yet/)).toBeInTheDocument()
    expect(within(screen.getByText("Ayo Bello").closest("li")).getByText("Declined")).toBeInTheDocument()
    expect(screen.getByText(/Turned the invitation down/)).toBeInTheDocument()
    expect(within(screen.getByText("Kim Park").closest("li")).getByText("No longer on the project")).toBeInTheDocument()
    expect(screen.getAllByText("Author not recorded").length).toBeGreaterThan(0)
  })

  it("shows a photo when there is one and initials otherwise", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    const { container } = render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)
    await screen.findByText("Sam Dube")

    expect(container.ownerDocument.querySelector('img[src="https://example.com/sam.png"]')).not.toBeNull()
    expect(within(screen.getByText("Thandi Nkosi").closest("li")).getByText("TN")).toBeInTheDocument()
  })

  it("explains how the figures are counted, including when schema changes began", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByText(/Schema changes are recorded from/)).toBeInTheDocument()
    expect(screen.getByText(/logged as already finished counts as logged only/)).toBeInTheDocument()
  })

  it("says so when no schema change has been recorded yet", async () => {
    fetchProjectTeam.mockResolvedValue({ ...team, schema_changes_recorded_since: null })
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByText(/none have been made since tracking began/)).toBeInTheDocument()
  })

  it("shows why it failed instead of an empty drawer", async () => {
    fetchProjectTeam.mockRejectedValue(new Error("Project not found"))
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Project not found")
  })

  it("loads the team of the project it is given", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    render(<ProjectTeam projectId="p9" projectName="Other" onClose={vi.fn()} />)

    await waitFor(() => expect(fetchProjectTeam).toHaveBeenCalledWith("p9"))
  })

  it("uses the singular for one person", async () => {
    fetchProjectTeam.mockResolvedValue({ ...team, people_working: 1, people_invited: 0 })
    render(<ProjectTeam projectId="p1" projectName="Solo" onClose={vi.fn()} />)

    expect(await screen.findByText("1 person working")).toBeInTheDocument()
  })
})

describe("lastActiveText", () => {
  const now = new Date("2026-10-09T12:00:00Z")
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString()

  it("reads recent activity in the nearest unit", () => {
    expect(lastActiveText(null, now)).toBe("No activity yet")
    expect(lastActiveText(ago(0), now)).toBe("Active just now")
    expect(lastActiveText(ago(1), now)).toBe("Active 1 minute ago")
    expect(lastActiveText(ago(45), now)).toBe("Active 45 minutes ago")
    expect(lastActiveText(ago(60 * 3), now)).toBe("Active 3 hours ago")
    expect(lastActiveText(ago(60 * 24 * 5), now)).toBe("Active 5 days ago")
  })

  it("gives a date once it is more than a month ago", () => {
    expect(lastActiveText(ago(60 * 24 * 60), now)).toMatch(/^Last active /)
  })
})

describe("recent activity", () => {
  const at = "2026-10-09T10:00:00Z"

  it("lists what people did, in words, newest first as the server sent it", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    fetchProjectActivity.mockResolvedValue({
      project_id: "p1",
      items: [
        { kind: "entry_completed", at, actor_name: "Sam Dube", subject: "Plan the lab" },
        { kind: "member_joined", at, actor_name: "Lee Moyo", subject: null },
      ],
    })
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    const feed = await screen.findByRole("region", { name: "Recent activity" })
    const lines = within(feed).getAllByRole("listitem")
    expect(lines[0]).toHaveTextContent("Sam Dube finished \u201cPlan the lab\u201d")
    expect(lines[1]).toHaveTextContent("Lee Moyo joined the project")
  })

  it("says so when nothing has happened", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByText("Nothing has happened here yet.")).toBeInTheDocument()
  })

  it("still shows the people when the feed cannot be loaded", async () => {
    fetchProjectTeam.mockResolvedValue(team)
    fetchProjectActivity.mockRejectedValue(new Error("down"))
    render(<ProjectTeam projectId="p1" projectName="Fieldwork" onClose={vi.fn()} />)

    expect(await screen.findByText("Sam Dube")).toBeInTheDocument()
    expect(await screen.findByText("Nothing has happened here yet.")).toBeInTheDocument()
  })

  it("words every kind of event", () => {
    const line = (kind, subject = "X") => activityText({ kind, actor_name: "Ann", subject })
    expect(line("entry_logged")).toBe("Ann logged \u201cX\u201d")
    expect(line("entry_edited")).toBe("Ann edited \u201cX\u201d")
    expect(line("entry_reverted")).toBe("Ann put \u201cX\u201d back to an earlier version")
    expect(line("entry_deleted")).toBe("Ann deleted \u201cX\u201d")
    expect(line("task_added")).toBe("Ann added the task \u201cX\u201d")
    expect(line("task_completed")).toBe("Ann completed the task \u201cX\u201d")
    expect(line("schema_changed", "added Weight")).toBe("Ann changed the schema (added Weight)")
    expect(line("schema_changed", null)).toBe("Ann changed the schema")
    expect(line("member_declined", null)).toBe("Ann declined the invitation")
    expect(line("entry_logged", null)).toBe("Ann logged an entry")
    expect(line("something_new")).toBe("Ann did something")
  })
})
