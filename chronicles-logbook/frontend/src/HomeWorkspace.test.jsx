import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, it, vi } from "vitest"

vi.mock("./DashboardPage", () => ({
  default: ({ embedded }) => <div data-testid="dashboard" data-embedded={String(embedded)}>My dashboard panels</div>,
}))

import HomeWorkspace from "./HomeWorkspace"

const projects = [
  { id: "first", name: "Field Notes", archived: false },
  { id: "second", name: "Research", archived: false },
  { id: "archive", name: "Completed work", archived: true },
]

function renderHome(props) {
  return render(
    <MemoryRouter>
      <HomeWorkspace projects={projects} onCreateProject={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

it("keeps the welcome and project counts, with the dashboard underneath it", () => {
  renderHome()

  expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument()
  expect(screen.getByText((_, element) => element?.textContent === "2 active projects")).toBeInTheDocument()
  expect(screen.getByText((_, element) => element?.textContent === "1 archived")).toBeInTheDocument()
  const dashboard = screen.getByTestId("dashboard")
  expect(dashboard).toHaveTextContent("My dashboard panels")
  expect(dashboard).toHaveAttribute("data-embedded", "true")
})

it("still lets someone start a project from the welcome", () => {
  const create = vi.fn()
  renderHome({ onCreateProject: create })

  fireEvent.click(screen.getByRole("button", { name: /New project/ }))

  expect(create).toHaveBeenCalledOnce()
})

it("no longer carries a Learning Chronicles section: that is a button under Mira", () => {
  renderHome()

  expect(screen.queryByText("Learn how to get the most out of your digital logbook")).not.toBeInTheDocument()
})
