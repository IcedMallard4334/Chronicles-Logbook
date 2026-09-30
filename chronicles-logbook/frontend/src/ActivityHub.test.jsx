import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("./ActivitiesPage", () => ({ default: () => <p>Scheduled activities list</p> }))

import ActivityHub from "./ActivityHub"

const logged = <p>Logged entries timeline</p>

describe("ActivityHub", () => {
  it("opens on what has been logged, with scheduled activities one tab away", () => {
    render(<ActivityHub logged={logged} />)

    expect(screen.getByRole("tab", { name: "Logged" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Logged entries timeline")).toBeInTheDocument()
    expect(screen.queryByText("Scheduled activities list")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: "Scheduled" }))

    expect(screen.getByRole("tab", { name: "Scheduled" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Scheduled activities list")).toBeInTheDocument()
    expect(screen.queryByText("Logged entries timeline")).not.toBeInTheDocument()
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "activity-tab-scheduled")
  })

  it("can open straight on the scheduled tab", () => {
    render(<ActivityHub logged={logged} initialTab="scheduled" />)
    expect(screen.getByText("Scheduled activities list")).toBeInTheDocument()
  })
})
