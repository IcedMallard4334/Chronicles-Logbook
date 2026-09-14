/**
 * Contract and behaviour tests for the API client.
 *
 * `api.test.js` covers the endpoints the first workstreams used. This file
 * covers the rest, and — more importantly — the behaviour inside `request()`
 * that every one of them depends on: how a failure is classified, how a
 * validation error is turned into a sentence, and how an expired session is
 * renewed. Those are the parts with logic in them; a wrong URL fails loudly
 * the first time it runs, while a mis-classified error fails quietly forever.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createCalendarActivity,
  createTask,
  deleteCalendarActivity,
  deleteProject,
  deleteSavedFilter,
  deleteTask,
  disconnectGoogleCalendar,
  fetchEntryLinks,
  fetchGoogleCalendarStatus,
  fetchProject,
  fetchProjectMembers,
  fetchProjects,
  fetchSavedFilters,
  previewSchemaChange,
  refreshSession,
  saveFilter,
  shareProject,
  toggleTask,
  unshareProject,
  updateSchema,
  updateTask,
} from "./api"

const BASE = "http://localhost:8000"

const ok = (body, status = 200) => ({ ok: true, status, json: async () => body })
const noContent = () => ({ ok: true, status: 204, json: async () => null })
const failure = (status, detail) => ({ ok: false, status, json: async () => ({ detail }) })

describe("api client — request behaviour", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    window.localStorage.clear()
  })

  it("flags an unreachable backend so offline sync can tell it apart from a refusal", async () => {
    // Matching on the message text would break the moment the wording changes,
    // which is why the flag exists.
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await expect(fetchProjects()).rejects.toMatchObject({ offline: true })
  })

  it("does not flag a server refusal as offline", async () => {
    fetch.mockResolvedValueOnce(failure(500, "Something broke"))

    const error = await fetchProjects().catch((thrown) => thrown)

    expect(error.status).toBe(500)
    expect(error.offline).toBeUndefined()
  })

  it("reports the server's detail rather than a status code", async () => {
    fetch.mockResolvedValueOnce(failure(400, "You already own this project"))

    await expect(fetchProjects()).rejects.toThrow("You already own this project")
  })

  it("turns a validation error list into one readable sentence", async () => {
    // FastAPI returns a list of objects for a 422; printing that raw would put
    // "[object Object]" in front of the user.
    fetch.mockResolvedValueOnce(
      failure(422, [{ msg: "Name is required" }, { msg: "Type is not valid" }])
    )

    await expect(fetchProjects()).rejects.toThrow("Name is required Type is not valid")
  })

  it("falls back to the status when the server sends no detail", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })

    await expect(fetchProjects()).rejects.toThrow("Request failed with status 503")
  })

  it("returns null for 204 rather than trying to parse an empty body", async () => {
    fetch.mockResolvedValueOnce(noContent())

    await expect(deleteProject("p1")).resolves.toBeNull()
  })

  it("sends the stored token as a bearer header", async () => {
    window.localStorage.setItem("chronicles_token", "a-token")
    fetch.mockResolvedValueOnce(ok([]))

    await fetchProjects()

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/projects`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer a-token" }),
      })
    )
  })

  it("omits the header entirely when there is no token", async () => {
    fetch.mockResolvedValueOnce(ok([]))

    await fetchProjects()

    const [, options] = fetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it("renews an expired session once and replays the original request", async () => {
    fetch
      .mockResolvedValueOnce(failure(401, "Invalid or expired session."))
      .mockResolvedValueOnce(ok({ access_token: "fresh", user: { id: "u1" } }))
      .mockResolvedValueOnce(ok([{ id: "p1" }]))

    await expect(fetchProjects()).resolves.toEqual([{ id: "p1" }])

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[1][0]).toBe(`${BASE}/auth/refresh`)
    // The replay carries the token the refresh just stored.
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh")
  })

  it("does not try to renew after an explicit sign-out", async () => {
    // Otherwise a background request would silently restore a cookie session
    // the person had just ended.
    window.localStorage.setItem("chronicles_signed_out", "true")
    fetch.mockResolvedValueOnce(failure(401, "Invalid or expired session."))

    await expect(fetchProjects()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not renew on a 401 that is not about the session", async () => {
    fetch.mockResolvedValueOnce(failure(401, "Wrong project password"))

    await expect(fetchProjects()).rejects.toThrow("Wrong project password")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("stores the renewed session", async () => {
    fetch.mockResolvedValueOnce(ok({ access_token: "t2", user: { id: "u2" } }))

    await refreshSession()

    expect(window.localStorage.getItem("chronicles_token")).toBe("t2")
    expect(JSON.parse(window.localStorage.getItem("chronicles_user"))).toEqual({ id: "u2" })
  })

  it("reports an ended session in words a person can act on", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

    await expect(refreshSession()).rejects.toThrow("Your session has ended. Please sign in again.")
  })
})

describe("api client — endpoint contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    window.localStorage.clear()
  })

  const urlOf = () => fetch.mock.calls[0][0]
  const optionsOf = () => fetch.mock.calls[0][1]

  it("reads one project", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "p1" }))
    await fetchProject("p1")
    expect(urlOf()).toBe(`${BASE}/projects/p1`)
  })

  it("deletes a project", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await deleteProject("p1")
    expect(urlOf()).toBe(`${BASE}/projects/p1`)
    expect(optionsOf().method).toBe("DELETE")
  })

  it("lists the people a project is shared with", async () => {
    fetch.mockResolvedValueOnce(ok([]))
    await fetchProjectMembers("p1")
    expect(urlOf()).toBe(`${BASE}/projects/p1/members`)
  })

  it("shares a project by email", async () => {
    fetch.mockResolvedValueOnce(ok({ user_id: "u2" }, 201))
    await shareProject("p1", "them@example.com")
    expect(urlOf()).toBe(`${BASE}/projects/p1/members`)
    expect(optionsOf().method).toBe("POST")
    expect(JSON.parse(optionsOf().body)).toEqual({ email: "them@example.com" })
  })

  it("withdraws a share by member id", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await unshareProject("p1", "u2")
    expect(urlOf()).toBe(`${BASE}/projects/p1/members/u2`)
    expect(optionsOf().method).toBe("DELETE")
  })

  it("previews a schema change before applying it", async () => {
    fetch.mockResolvedValueOnce(ok({ changes: [] }))
    await previewSchemaChange("p1", [{ id: "f1", name: "Hours", type: "number" }])
    expect(urlOf()).toBe(`${BASE}/projects/p1/schema/preview`)
    expect(optionsOf().method).toBe("POST")
  })

  it("applies a schema change with PUT", async () => {
    fetch.mockResolvedValueOnce(ok({ entry_schema: [] }))
    await updateSchema("p1", [])
    expect(urlOf()).toBe(`${BASE}/projects/p1/schema`)
    expect(optionsOf().method).toBe("PUT")
  })

  it("creates a task under its project", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "t1" }, 201))
    await createTask("p1", { title: "Write up" })
    expect(urlOf()).toBe(`${BASE}/projects/p1/tasks`)
    expect(JSON.parse(optionsOf().body)).toEqual({ title: "Write up" })
  })

  it("updates a task with PUT", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "t1" }))
    await updateTask("p1", "t1", { title: "Renamed" })
    expect(urlOf()).toBe(`${BASE}/projects/p1/tasks/t1`)
    expect(optionsOf().method).toBe("PUT")
  })

  it("toggles a task with PATCH, since it changes one field", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "t1", completed: true }))
    await toggleTask("p1", "t1")
    expect(urlOf()).toBe(`${BASE}/projects/p1/tasks/t1/toggle`)
    expect(optionsOf().method).toBe("PATCH")
  })

  it("deletes a task", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await deleteTask("p1", "t1")
    expect(urlOf()).toBe(`${BASE}/projects/p1/tasks/t1`)
    expect(optionsOf().method).toBe("DELETE")
  })

  it("lists saved filters", async () => {
    fetch.mockResolvedValueOnce(ok([]))
    await fetchSavedFilters()
    expect(urlOf()).toBe(`${BASE}/saved-filters`)
  })

  it("saves a filter with its criteria", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "f1" }, 201))
    await saveFilter("Open work", { todo: true })
    expect(urlOf()).toBe(`${BASE}/saved-filters`)
    expect(JSON.parse(optionsOf().body)).toMatchObject({ name: "Open work" })
  })

  it("deletes a saved filter", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await deleteSavedFilter("f1")
    expect(urlOf()).toBe(`${BASE}/saved-filters/f1`)
    expect(optionsOf().method).toBe("DELETE")
  })

  it("reads the entries that link to an entry", async () => {
    fetch.mockResolvedValueOnce(ok([]))
    await fetchEntryLinks("p1", "e1")
    expect(urlOf()).toBe(`${BASE}/projects/p1/entries/e1/links`)
  })

  it("reads the Google Calendar connection status", async () => {
    fetch.mockResolvedValueOnce(ok({ connected: false }))
    await fetchGoogleCalendarStatus()
    expect(urlOf()).toBe(`${BASE}/calendar/google/status`)
  })

  it("disconnects one calendar account when given an id", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await disconnectGoogleCalendar("acc 1")
    // Encoded, so an id containing a space or & cannot break the query string.
    expect(urlOf()).toBe(`${BASE}/calendar/google/disconnect?account_id=acc%201`)
  })

  it("disconnects every calendar account when given no id", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await disconnectGoogleCalendar()
    expect(urlOf()).toBe(`${BASE}/calendar/google/disconnect`)
  })

  it("creates a calendar activity", async () => {
    fetch.mockResolvedValueOnce(ok({ id: "a1" }, 201))
    await createCalendarActivity({ day: "2026-09-14", note: "Wrote up findings" })
    expect(urlOf()).toBe(`${BASE}/calendar/activities`)
    expect(optionsOf().method).toBe("POST")
  })

  it("deletes a calendar activity", async () => {
    fetch.mockResolvedValueOnce(noContent())
    await deleteCalendarActivity("a1")
    expect(urlOf()).toBe(`${BASE}/calendar/activities/a1`)
    expect(optionsOf().method).toBe("DELETE")
  })
})
