import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchProjects,
  createProject,
  createEntry,
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
})
