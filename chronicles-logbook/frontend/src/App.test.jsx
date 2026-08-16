import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import App from "./App"

vi.mock("./api", () => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  unarchiveProject: vi.fn(),
  fetchEntries: vi.fn(),
  fetchEntriesGlobal: vi.fn(),
  createEntry: vi.fn(),
  deleteAccount: vi.fn(),
}))

import {
  fetchProjects,
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  fetchEntries,
  fetchEntriesGlobal,
  createEntry,
} from "./api"

const mockProject = {
  id: "proj-1",
  name: "Field Notes",
  archived: false,
  entry_schema: [
    { id: "hours", name: "Hours", type: "number" },
    { id: "mood", name: "Mood", type: "dropdown", options: ["Steady", "Focused"] },
  ],
}

const mockEntries = [
  {
    id: "entry-1",
    project_id: "proj-1",
    data: { hours: 2, mood: "Steady" },
    created_at: "2026-08-12T08:00:00Z",
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  fetchProjects.mockResolvedValue([mockProject])
  fetchEntries.mockResolvedValue(mockEntries)
})

describe("App", () => {
  it("renders the brand and empty state when no projects exist", async () => {
    fetchProjects.mockResolvedValue([])
    render(<App />)

    expect(screen.getByText("Chronicles")).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByText("Create your first project to start building a custom logbook.")
      ).toBeInTheDocument()
    })
  })

  it("loads and displays projects", async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })
  })

  it("shows project details when a project is selected", async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Field Notes"))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Field Notes" })).toBeInTheDocument()
    })
    expect(screen.getByRole("tab", { name: "Entries" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Schema" })).toBeInTheDocument()
  })

  it("creates a new project from the empty state using the modal", async () => {
    fetchProjects.mockResolvedValue([])
    createProject.mockResolvedValue(mockProject)

    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText("Create your first project to start building a custom logbook.")
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Create project"))

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Start a new project" })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Field Notes" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm create project" }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: "Field Notes",
        description: null,
        entry_schema: [],
      })
    })
  })

  it("creates a new project with a description", async () => {
    fetchProjects.mockResolvedValue([])
    createProject.mockResolvedValue(mockProject)

    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText("Create your first project to start building a custom logbook.")
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Create project"))

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Start a new project" })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Field Notes" },
    })
    fireEvent.change(screen.getByLabelText("Description (optional)"), {
      target: { value: "Notes from the field" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm create project" }))

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: "Field Notes",
        description: "Notes from the field",
        entry_schema: [],
      })
    })
  })

  it("edits a project's name and description", async () => {
    updateProject.mockResolvedValue({
      ...mockProject,
      name: "Field Notes Updated",
      description: "Updated description",
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Field Notes"))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Field Notes" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Edit project" }))

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Field Notes Updated" },
    })
    fireEvent.change(screen.getByLabelText("Description (optional)"), {
      target: { value: "Updated description" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith("proj-1", {
        name: "Field Notes Updated",
        description: "Updated description",
      })
    })
  })

  it("saves the entry schema", async () => {
    updateProject.mockResolvedValue({
      ...mockProject,
      entry_schema: [{ id: "note", name: "Note", type: "text" }],
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Field Notes"))
    fireEvent.click(screen.getByRole("tab", { name: "Schema" }))

    await waitFor(() => {
      expect(screen.getByText("Entry schema")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Add field"))

    const nameInputs = screen.getAllByPlaceholderText("Field name")
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: "Note" } })

    fireEvent.click(screen.getByText("Save schema"))

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith("proj-1", {
        name: "Field Notes",
        entry_schema: expect.arrayContaining([
          expect.objectContaining({ name: "Note", type: "text" }),
        ]),
      })
    })
  })

  it("archives a project and blocks new entries", async () => {
    archiveProject.mockResolvedValue({ ...mockProject, archived: true })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Field Notes"))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Field Notes" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Archive project" }))

    await waitFor(() => {
      expect(archiveProject).toHaveBeenCalledWith("proj-1")
    })

    await waitFor(() => {
      expect(screen.getByText("Archived")).toBeInTheDocument()
      expect(
        screen.getByText("This project is archived. Unarchive it to add new entries.")
      ).toBeInTheDocument()
    })
    expect(screen.queryByLabelText("Hours")).not.toBeInTheDocument()
  })

  it("unarchives a project", async () => {
    fetchProjects.mockResolvedValue([{ ...mockProject, archived: true }])
    unarchiveProject.mockResolvedValue({ ...mockProject, archived: false })

    render(<App />)

    fireEvent.click(await screen.findByText("Show archived (1)"))
    fireEvent.click(await screen.findByText("Field Notes"))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unarchive project" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Unarchive project" }))

    await waitFor(() => {
      expect(unarchiveProject).toHaveBeenCalledWith("proj-1")
    })
    await waitFor(() => {
      expect(screen.queryByText("Archived")).not.toBeInTheDocument()
    })
  })

  it("hides archived projects behind a toggle in the sidebar", async () => {
    fetchProjects.mockResolvedValue([
      mockProject,
      { ...mockProject, id: "proj-2", name: "Old Project", archived: true },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    expect(screen.queryByText("Old Project")).not.toBeInTheDocument()
    expect(screen.getByText("Show archived (1)")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Show archived (1)"))

    await waitFor(() => {
      expect(screen.getByText("Old Project")).toBeInTheDocument()
    })
  })

  it("creates an entry using the dynamic form", async () => {
    createEntry.mockResolvedValue({
      id: "entry-2",
      project_id: "proj-1",
      data: { hours: "3", mood: "Focused" },
      created_at: "2026-08-12T09:00:00Z",
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Field Notes"))

    await waitFor(() => {
      expect(screen.getByLabelText("Hours")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "3" } })
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "Focused" } })
    fireEvent.click(screen.getByText("Save entry"))

    await waitFor(() => {
      expect(createEntry).toHaveBeenCalledWith("proj-1", {
        hours: 3,
        mood: "Focused",
      })
    })
  })

  it("updates the entry form when switching between projects with different schemas", async () => {
    const projectA = {
      ...mockProject,
      id: "proj-a",
      name: "Project A",
      entry_schema: [{ id: "pages", name: "Pages read", type: "number" }],
    }
    const projectB = {
      ...mockProject,
      id: "proj-b",
      name: "Project B",
      entry_schema: [{ id: "location", name: "Location", type: "text" }],
    }

    fetchProjects.mockResolvedValue([projectA, projectB])
    fetchEntries.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Project A")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Project A"))
    await waitFor(() => {
      expect(screen.getByLabelText("Pages read")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("Project B"))
    await waitFor(() => {
      expect(screen.getByLabelText("Location")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText("Pages read")).not.toBeInTheDocument()
  })

  it("shows the timeline with all entries", async () => {
    fetchEntriesGlobal.mockResolvedValue(mockEntries)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Timeline"))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    })
    expect(screen.getByText("Steady")).toBeInTheDocument()
    expect(fetchEntriesGlobal).toHaveBeenCalledWith({ q: "", projectId: "" })
  })

  it("searches entries by keyword in the timeline", async () => {
    fetchEntriesGlobal.mockResolvedValue([
      {
        id: "entry-2",
        project_id: "proj-1",
        project_name: "Field Notes",
        data: { hours: 3, mood: "Focused" },
        created_at: "2026-08-12T09:00:00Z",
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Field Notes")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Timeline"))

    await waitFor(() => {
      expect(screen.getByLabelText("Search entries")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Search entries"), {
      target: { value: "Focused" },
    })

    await waitFor(() => {
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith({ q: "Focused", projectId: "" })
    })
    expect(screen.getByText("Focused")).toBeInTheDocument()
  })

  it("filters timeline entries by project", async () => {
    const projectB = { ...mockProject, id: "proj-2", name: "Old Project" }
    fetchProjects.mockResolvedValue([mockProject, projectB])
    fetchEntriesGlobal.mockResolvedValue([
      {
        id: "entry-3",
        project_id: "proj-2",
        project_name: "Old Project",
        data: { hours: 1, mood: "Steady" },
        created_at: "2026-08-12T10:00:00Z",
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("Old Project")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("Timeline"))

    await waitFor(() => {
      expect(screen.getByLabelText("Filter by project")).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText("Filter by project"), {
      target: { value: "proj-2" },
    })

    await waitFor(() => {
      expect(fetchEntriesGlobal).toHaveBeenLastCalledWith({ q: "", projectId: "proj-2" })
    })
    expect(screen.getByText("Steady")).toBeInTheDocument()
    expect(screen.queryByText("2")).not.toBeInTheDocument()
  })
})
