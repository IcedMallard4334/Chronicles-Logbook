import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  archiveProject,
  createEntry,
  createProject,
  deleteAccount,
  deleteEntry,
  fetchCurrentUser,
  fetchEntries,
  fetchFieldStatistics,
  fetchEntriesGlobal,
  fetchEntry,
  fetchEntryMigrationPreview,
  fetchFieldTimeline,
  fetchProjects,
  fetchStatistics,
  fetchTasks,
  getGoogleLoginUrl,
  sendAIMessage,
  unarchiveProject,
  updateEntry,
  updateProject,
} from "./api"

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("fetches projects", async () => {
    const projects = [{ id: "1", name: "Notes" }]
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => projects,
    })

    const result = await fetchProjects()

    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/projects", {
      credentials: "include", headers: { "Content-Type": "application/json" },
    })
    expect(result).toEqual(projects)
  })

  it("sends an authenticated AI chat request", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reply: "Keep short notes." }) })

    await expect(sendAIMessage("How should I log progress?")).resolves.toEqual({ reply: "Keep short notes." })
    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/ai/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "How should I log progress?" }),
    })
  })

  it("creates a project", async () => {
    const project = { id: "1", name: "Notes" }
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => project,
    })

    const result = await createProject({ name: "Notes" })

    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/projects", {
      method: "POST",
      credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Notes" }),
    })
    expect(result).toEqual(project)
  })

  it("throws an error with backend detail", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Invalid schema" }),
    })

    await expect(createProject({ name: "Bad" })).rejects.toThrow("Invalid schema")
  })

  it("creates an entry", async () => {
    const entry = { id: "entry-1", data: { hours: 2 } }
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => entry,
    })

    const result = await createEntry("proj-1", { data: { hours: 2 } })

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries",
      {
        method: "POST",
        credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { hours: 2 }, time_spent: null }),
      }
    )
    expect(result).toEqual(entry)
  })

  it("fetches a single entry", async () => {
    const entry = { id: "entry-1", data: { hours: 2 } }
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => entry })

    const result = await fetchEntry("proj-1", "entry-1")

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries/entry-1",
      { credentials: "include", headers: { "Content-Type": "application/json" } }
    )
    expect(result).toEqual(entry)
  })

  it("updates an entry's data without touching time_spent", async () => {
    // An omitted time_spent must not be sent at all, otherwise the backend
    // reads it as an explicit null and clears the recorded duration.
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await updateEntry("proj-1", "entry-1", { data: { hours: 3 } })

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries/entry-1",
      {
        method: "PUT",
        credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { hours: 3 } }),
      }
    )
  })

  it("sends an explicit null to clear time_spent", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await updateEntry("proj-1", "entry-1", { time_spent: null })

    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ time_spent: null }))
  })

  it("sends migrate_to_current_schema only when explicitly requested", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await updateEntry("proj-1", "entry-1", { data: { hours: 3 }, migrateToCurrentSchema: true })

    expect(fetch.mock.calls[0][1].body).toBe(
      JSON.stringify({ data: { hours: 3 }, migrate_to_current_schema: true })
    )
  })

  it("omits migrate_to_current_schema for an ordinary edit", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await updateEntry("proj-1", "entry-1", { data: { hours: 3 } })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("migrate_to_current_schema")
  })

  it("fetches a preview of migrating one entry to the current schema", async () => {
    const preview = { data: { hours: 3 }, retired_data: {}, changes: [] }
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => preview })

    const result = await fetchEntryMigrationPreview("proj-1", "entry-1")

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries/entry-1/migration-preview",
      { credentials: "include", headers: { "Content-Type": "application/json" } }
    )
    expect(result).toEqual(preview)
  })

  it("deletes an entry", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null })

    const result = await deleteEntry("proj-1", "entry-1")

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries/entry-1",
      {
        method: "DELETE",
        credentials: "include", headers: { "Content-Type": "application/json" },
      }
    )
    expect(result).toBeNull()
  })

  it("fetches statistics", async () => {
    const statistics = { totals: { entries: 12, time_spent: 90 }, projects: [] }
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => statistics })

    const result = await fetchStatistics()

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/statistics",
      { credentials: "include", headers: { "Content-Type": "application/json" } }
    )
    expect(result).toEqual(statistics)
  })

  it("fetches a field timeline with an optional date range", async () => {
  const timeline = {
    project_id: "proj-1",
    field_id: "hours",
    field_name: "Hours",
    field_type: "number",
    start: "2026-05-01T00:00:00+00:00",
    end: "2026-05-31T23:59:59+00:00",
    points: [
      {
        entry_id: "entry-1",
        created_at: "2026-05-05T09:00:00+00:00",
        value: 5,
        schema_version: 1,
      },
    ],
  }

  fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => timeline,
  })

  const result = await fetchFieldTimeline(
    "proj-1",
    "hours",
    "2026-05-01T00:00:00+00:00",
    "2026-05-31T23:59:59+00:00",
  )

  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:8000/statistics/projects/proj-1/fields/hours/timeline?start=2026-05-01T00%3A00%3A00%2B00%3A00&end=2026-05-31T23%3A59%3A59%2B00%3A00",
    expect.anything(),
  )

  expect(result).toEqual(timeline)
})

  it("fetches entries globally without filters", async () => {
    const entries = [{ id: "entry-1", data: { hours: 2 } }]
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => entries,
    })

    const result = await fetchEntriesGlobal()

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/entries?page=1&page_size=20",
      {
        credentials: "include", headers: { "Content-Type": "application/json" },
      }
    )
    expect(result).toEqual(entries)
  })

  it("fetches entries globally with search, project and date filters", async () => {
    const entries = [{ id: "entry-1", data: { hours: 2 } }]
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => entries,
    })

    const result = await fetchEntriesGlobal({
      q: "notes",
      projectId: "proj-1",
      start: "2026-09-01T00:00:00",
      end: "2026-09-30T23:59:59.999",
      page: 2,
      pageSize: 10,
    })

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/entries?q=notes&project_id=proj-1&start=2026-09-01T00%3A00%3A00&end=2026-09-30T23%3A59%3A59.999&page=2&page_size=10",
      {
        credentials: "include", headers: { "Content-Type": "application/json" },
      }
    )
    expect(result).toEqual(entries)
  })

  it("builds the Google login URL", () => {
    expect(getGoogleLoginUrl()).toBe("http://localhost:8000/auth/google/login")
  })

  it("loads the current user using the stored bearer token", async () => {
    const user = { id: "user-1", email: "e@example.com" }
    window.localStorage.setItem("chronicles_token", "session-token")
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => user })

    await expect(fetchCurrentUser()).resolves.toEqual(user)
    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/auth/me", {
      credentials: "include", headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
    })
  })

  it("deletes the authenticated account", async () => {
    window.localStorage.setItem("chronicles_token", "session-token")
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })

    await expect(deleteAccount()).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/auth/account", {
      method: "DELETE",
      credentials: "include", headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
    })
  })
})
