import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { EditButton } from "./EditIcon"

describe("EditButton", () => {
  it("shows a pencil beside the label and keeps its accessible name", () => {
    const onClick = vi.fn()
    const { container } = render(<EditButton aria-label="Edit task" onClick={onClick} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit task" }))

    expect(onClick).toHaveBeenCalled()
    expect(container.querySelector("svg.pencil-icon")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Edit")).toBeInTheDocument()
  })
})
