import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { TipBubble } from "./Tip"

describe("TipBubble", () => {
  it("shows its text but hides it from assistive technology, so it is not read twice", () => {
    const { container } = render(
      <button className="has-tip" aria-label="Login streak">
        <TipBubble text="Consecutive days you have opened Chronicles." />
      </button>
    )

    const bubble = container.querySelector(".tip-bubble")
    expect(bubble).toHaveTextContent("Consecutive days you have opened Chronicles.")
    expect(bubble).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByRole("button", { name: "Login streak" })).toBeInTheDocument()
  })

  it("centres by default and can anchor to the right edge", () => {
    const { container, rerender } = render(<TipBubble text="x" />)
    expect(container.querySelector(".tip-bubble")).toHaveClass("is-center")

    rerender(<TipBubble text="x" align="end" />)
    expect(container.querySelector(".tip-bubble")).toHaveClass("is-end")
  })

  it("is not the browser's own title tooltip", () => {
    const { container } = render(<TipBubble text="x" />)

    expect(container.querySelector("[title]")).toBeNull()
  })
})
