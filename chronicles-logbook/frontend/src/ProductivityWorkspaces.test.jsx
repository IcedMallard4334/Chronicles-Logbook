import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"
import TodayPage from "./TodayPage"
import CommandPalette from "./CommandPalette"

vi.mock("./api", () => ({
  fetchEntriesGlobal: vi.fn(),
  fetchTasks: vi.fn(),
}))
import { fetchEntriesGlobal, fetchTasks } from "./api"

const projects = [{ id: "p1", name: "Operations", archived: false }]
beforeEach(() => { vi.clearAllMocks(); fetchEntriesGlobal.mockResolvedValue([]); fetchTasks.mockResolvedValue([]) })

it("shows a useful empty Today workspace", async () => {
  render(<TodayPage projects={projects} onNavigate={vi.fn()} onCreateProject={vi.fn()} />)
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText("Your task list is clear.")).toBeInTheDocument())
  expect(screen.getByText("Project health")).toBeInTheDocument()
})

it("opens command menu with Ctrl K and navigates", () => {
  const navigate = vi.fn()
  render(<MemoryRouter><CommandPalette projects={projects} onNavigate={navigate} onCreateProject={vi.fn()} /></MemoryRouter>)
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  fireEvent.click(screen.getByRole("button", { name: /Go to Today/ }))
  expect(navigate).toHaveBeenCalledWith("today")
})
