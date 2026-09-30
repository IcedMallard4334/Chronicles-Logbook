import { render } from "@testing-library/react"
import { expect, it } from "vitest"

import { ActivityIcon, BoardIcon, OutstandingIcon, TodayIcon } from "./NavIcons"

it("draws four different icons, all hidden from screen readers", () => {
  const drawn = [ActivityIcon, TodayIcon, OutstandingIcon, BoardIcon].map((Icon) => {
    const { container } = render(<Icon />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24")
    return svg.innerHTML
  })

  expect(new Set(drawn).size).toBe(4)
})
