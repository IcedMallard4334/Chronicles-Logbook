import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createEntry,
  createProject,
  deleteAccount,
  fetchCurrentUser,
  fetchProjects,
  getGoogleLoginUrl,
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
      headers: { "Content-Type": "application/json" },
    })
    expect(result).toEqual(projects)
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
      headers: { "Content-Type": "application/json" },
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

    const result = await createEntry("proj-1", { hours: 2 })

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/entries",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { hours: 2 } }),
      }
    )
    expect(result).toEqual(entry)
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
      headers: {
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
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
    })
  })
})
