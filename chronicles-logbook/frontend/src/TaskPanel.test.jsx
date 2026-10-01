import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TaskPanel, TaskForm } from "./TaskPanel"
import { createTask, deleteTask, fetchTasks, toggleTask } from "./api"

vi.mock("./api", () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTasks: vi.fn(),
  toggleTask: vi.fn(),
  updateTask: vi.fn(),
}))

const mockTask = {
  id: "task-1",
  project_id: "proj-1",
  title: "Write tests",
  description: "Cover checklist UI",
  due_date: "2026-08-30",
  completed: false,
  checklist: [
    { id: "chk-1", text: "Render task list", completed: true },
    { id: "chk-2", text: "Toggle checklist item", completed: false },
  ],
  created_at: "2026-08-12T08:00:00Z",
  updated_at: "2026-08-12T08:00:00Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchTasks.mockResolvedValue([mockTask])
})

describe("TaskPanel", () => {
  it("loads and displays tasks", async () => {
    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument()
    })
    expect(screen.getByText("Cover checklist UI")).toBeInTheDocument()
    expect(fetchTasks).toHaveBeenCalledWith("proj-1", undefined)
  })

  it("filters tasks by completion status", async () => {
    fetchTasks.mockResolvedValue([mockTask])

    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("tab", { name: "Open (1)" }))

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenLastCalledWith("proj-1", false)
    })

    fireEvent.click(screen.getByRole("tab", { name: "Done (0)" }))

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenLastCalledWith("proj-1", true)
    })
  })

  it("shows empty state when no tasks exist", async () => {
    fetchTasks.mockResolvedValue([])

    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("No tasks yet. Add one to get started.")).toBeInTheDocument()
    })
  })

  it("toggles a task", async () => {
    toggleTask.mockResolvedValue({ ...mockTask, completed: true })

    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument()
    })

    const completeButtons = screen.getAllByLabelText("Mark complete")
    fireEvent.click(completeButtons[0])

    await waitFor(() => {
      expect(toggleTask).toHaveBeenCalledWith("proj-1", "task-1")
    })
  })

  it("nudges someone who finishes a task to record what they did as an entry", async () => {
    toggleTask.mockResolvedValue({ ...mockTask, completed: true })
    const onLogEntry = vi.fn()
    render(<TaskPanel projectId="proj-1" onLogEntry={onLogEntry} />)
    await screen.findByText("Write tests")

    fireEvent.click(screen.getAllByLabelText("Mark complete")[0])

    const note = await screen.findByRole("status")
    expect(note).toHaveTextContent("Finished “Write tests”")
    expect(note).toHaveTextContent("A task is a plan; an entry is the record.")
    fireEvent.click(within(note).getByRole("button", { name: "Log an entry" }))
    expect(onLogEntry).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Finished “Write tests”/)).not.toBeInTheDocument()
  })

  it("lets the nudge be dismissed, and offers no entry button where none can be logged", async () => {
    toggleTask.mockResolvedValue({ ...mockTask, completed: true })
    render(<TaskPanel projectId="proj-1" />)
    await screen.findByText("Write tests")

    fireEvent.click(screen.getAllByLabelText("Mark complete")[0])
    const note = await screen.findByRole("status")
    expect(within(note).queryByRole("button", { name: "Log an entry" })).not.toBeInTheDocument()

    fireEvent.click(within(note).getByRole("button", { name: "Not now" }))
    expect(screen.queryByText(/Finished “Write tests”/)).not.toBeInTheDocument()
  })

  it("deletes a task after confirmation", async () => {
    deleteTask.mockResolvedValue(null)
    window.confirm = vi.fn(() => true)

    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete task" }))

    await waitFor(() => {
      expect(deleteTask).toHaveBeenCalledWith("proj-1", "task-1")
    })
  })

  it("shows checklist progress for a task", async () => {
    render(<TaskPanel projectId="proj-1" />)

    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument()
    })

    expect(screen.getByText("1/2")).toBeInTheDocument()
  })
})

describe("TaskForm", () => {
  it("creates a task with a checklist", async () => {
    createTask.mockResolvedValue({ id: "task-2", title: "New task" })

    const onSaved = vi.fn()
    render(<TaskForm projectId="proj-1" onSaved={onSaved} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } })

    const checklistInput = screen.getByPlaceholderText("Add a checkpoint…")
    fireEvent.change(checklistInput, { target: { value: "First item" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => {
      expect(screen.getByText("First item")).toBeInTheDocument()
    })

    fireEvent.change(checklistInput, { target: { value: "Second item" } })
    fireEvent.keyDown(checklistInput, { key: "Enter", code: "Enter" })

    await waitFor(() => {
      expect(screen.getByText("Second item")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add task" }))

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({
          title: "New task",
          checklist: expect.arrayContaining([
            expect.objectContaining({ text: "First item", completed: false }),
            expect.objectContaining({ text: "Second item", completed: false }),
          ]),
        })
      )
    })
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it("toggles and removes checklist items while editing", async () => {
    render(
      <TaskForm
        projectId="proj-1"
        task={mockTask}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const checklistList = screen.getByRole("list", { name: "" })
    const firstItem = within(checklistList).getByText("Render task list").closest("li")
    expect(firstItem).toBeInTheDocument()

    expect(within(firstItem).getByLabelText("Mark incomplete")).toBeInTheDocument()

    fireEvent.click(within(firstItem).getByLabelText("Mark incomplete"))

    await waitFor(() => {
      expect(within(firstItem).getByLabelText("Mark complete")).toBeInTheDocument()
    })

    fireEvent.click(within(firstItem).getByRole("button", { name: "Remove checklist item" }))

    await waitFor(() => {
      expect(within(checklistList).queryByText("Render task list")).not.toBeInTheDocument()
    })
  })

  it("shows an error when title is empty", async () => {
    createTask.mockResolvedValue({ id: "task-2", title: "" })

    render(<TaskForm projectId="proj-1" onSaved={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Add task" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Task title can't be empty.")
    })
    expect(createTask).not.toHaveBeenCalled()
  })
})

describe("task time of day", () => {
  it("is disabled until there is a date, then saved with the task", async () => {
    createTask.mockResolvedValue({})
    render(<TaskForm projectId="proj-1" onSaved={() => {}} />)

    const time = screen.getByLabelText(/Time of day/)
    expect(time).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Call the bank" } })
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-05" } })
    expect(time).toBeEnabled()
    fireEvent.change(time, { target: { value: "14:30" } })
    fireEvent.click(screen.getByRole("button", { name: "Add task" }))

    await waitFor(() => expect(createTask).toHaveBeenCalled())
    expect(createTask.mock.calls[0][1]).toMatchObject({ due_date: "2026-10-05", due_time: "14:30" })
  })

  it("shows the time beside the date in the list", async () => {
    fetchTasks.mockResolvedValue([{ ...mockTask, due_time: "09:15:00" }])
    render(<TaskPanel projectId="proj-1" />)

    expect(await screen.findByText(/· 09:15/)).toBeInTheDocument()
  })
})
