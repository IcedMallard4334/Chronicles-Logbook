import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import HomeWorkspace from "./HomeWorkspace"

const projects = [
  {id:"first", name:"Field Notes", archived:false},
  {id:"second", name:"Research", archived:false},
  {id:"archive", name:"Completed work", archived:true},
]

it("shows a workspace welcome and one clear continuation", () => {
  render(<HomeWorkspace projects={projects} onCreateProject={vi.fn()} onToday={vi.fn()} onNavigate={vi.fn()} />)
  expect(screen.getByRole("heading", {name:"Welcome back"})).toBeInTheDocument()
  expect(screen.getByText((_, element) => element?.textContent === "2 active projects")).toBeInTheDocument()
  expect(screen.getByText((_, element) => element?.textContent === "1 archived")).toBeInTheDocument()
  expect(screen.getByRole("heading", {name:"Field Notes"})).toBeInTheDocument()
})

it("connects the welcome shortcuts to their intended actions", () => {
  const create = vi.fn(), today = vi.fn(), navigate = vi.fn(), openProject = vi.fn()
  render(<HomeWorkspace projects={projects} onCreateProject={create} onToday={today} onNavigate={navigate} onOpenProject={openProject} />)
  fireEvent.click(screen.getByRole("button", {name:/New project/}))
  fireEvent.click(screen.getByRole("button", {name:/Open Today/}))
  fireEvent.click(screen.getByRole("button", {name:"View entries"}))
  fireEvent.click(screen.getByRole("button", {name:/Open project/}))
  expect(create).toHaveBeenCalledOnce()
  expect(today).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenNthCalledWith(1, "entries")
  expect(openProject).toHaveBeenCalledWith("first")
  expect(screen.getByRole("heading", {name:"A clearer way to capture your work"})).toBeInTheDocument()
})
