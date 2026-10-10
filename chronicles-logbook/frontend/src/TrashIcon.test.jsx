import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TrashButton } from "./TrashIcon"

describe("TrashButton", () => {
  it("is named for screen readers and carries a lid that can animate", () => {
    const onClick = vi.fn()
    const { container } = render(<TrashButton label="Delete task" onClick={onClick} />)
    const button = screen.getByRole("button", { name: "Delete task" })
    // Our own tooltip, not the browser's title attribute.
    expect(button).not.toHaveAttribute("title")
    expect(screen.getByText("Delete task")).toHaveClass("tip-bubble")
    expect(container.querySelector(".trash-lid")).toBeInTheDocument()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it("shows its text beside the icon when given, and respects disabled", () => {
    render(<TrashButton label="Delete entry" text="Delete" disabled />)
    const button = screen.getByRole("button", { name: "Delete" })
    expect(button).toBeDisabled()
  })
})
