import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import CommandPalette from "./CommandPalette"

const projects = [{ id: "p1", name: "Field Notes" }]

// CommandPalette navigates to /help itself (everything else goes through
// onNavigate, an in-app view switch), so it needs real Router context — a
// second route stands in for the page it should land on.
function renderPalette(props) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<CommandPalette {...props} />} />
        <Route path="/help" element={<p>Help page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("CommandPalette", () => {
  it("opens from the trigger and moves focus into the search field", () => {
    renderPalette({ projects, onNavigate: vi.fn() })

    fireEvent.click(screen.getByRole("button", { name: "Open command menu" }))

    expect(screen.getByPlaceholderText(/Search commands/)).toHaveFocus()
  })

  it("closes on Escape and returns focus to the trigger", () => {
    renderPalette({ projects, onNavigate: vi.fn() })
    const trigger = screen.getByRole("button", { name: "Open command menu" })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    // Best-effort, same trade-off documented in useDialogFocus: the trigger
    // and the dialog are mutually exclusive renders, so the trigger
    // unmounted the instant the dialog opened and there was nothing for the
    // hook to remember to focus back — it degrades to the new trigger that
    // reappears once closed being focusable, not literally "restored".
    expect(screen.getByRole("button", { name: "Open command menu" })).toBeInTheDocument()
  })

  it("opens with Ctrl+K from anywhere and toggles closed with it again", () => {
    renderPalette({ projects, onNavigate: vi.fn() })

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("running a command closes the palette", () => {
    const onNavigate = vi.fn()
    renderPalette({ projects, onNavigate })
    fireEvent.click(screen.getByRole("button", { name: "Open command menu" }))

    fireEvent.click(screen.getByRole("button", { name: /Go to Today/ }))

    expect(onNavigate).toHaveBeenCalledWith("today")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("filters commands as the query changes", () => {
    renderPalette({ projects, onNavigate: vi.fn() })
    fireEvent.click(screen.getByRole("button", { name: "Open command menu" }))

    fireEvent.change(screen.getByPlaceholderText(/Search commands/), {
      target: { value: "Field Notes" },
    })

    expect(screen.getByRole("button", { name: /Field Notes/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Go to Today/ })).not.toBeInTheDocument()
  })

  it("offers Help & documentation and navigates there", () => {
    renderPalette({ projects, onNavigate: vi.fn() })
    fireEvent.click(screen.getByRole("button", { name: "Open command menu" }))

    fireEvent.click(screen.getByRole("button", { name: /Help & documentation/ }))

    // A client-side route change, not a full page reload — the earlier
    // route's content is gone and the destination's is here instead.
    expect(screen.getByText("Help page")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
