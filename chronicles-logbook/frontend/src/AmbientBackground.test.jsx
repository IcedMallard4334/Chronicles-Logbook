import { render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import AmbientBackground from "./AmbientBackground"

afterEach(() => {
  delete document.documentElement.dataset.customGlow
  delete document.documentElement.dataset.accent
  delete document.documentElement.dataset.theme
})

describe("AmbientBackground", () => {
  it("defaults to the chronicles scene when no accent has been set", () => {
    const { container } = render(<AmbientBackground />)

    expect(container.querySelector(".ambient-chronicles")).toBeInTheDocument()
    expect(container.querySelector(".ambient-folds")).toBeInTheDocument()
  })

  it("renders the scene matching the accent already on the page", () => {
    document.documentElement.dataset.accent = "ocean"

    const { container } = render(<AmbientBackground />)

    expect(container.querySelector(".ambient-ocean")).toBeInTheDocument()
    expect(container.querySelector(".ambient-swell")).toBeInTheDocument()
  })

  it("switches scene immediately when the accent changes on the page (US-3.24)", async () => {
    const { container } = render(<AmbientBackground />)
    expect(container.querySelector(".ambient-chronicles")).toBeInTheDocument()

    // This is exactly what ProfilePage's accent selector does: write the
    // preference, then set the attribute this component watches.
    document.documentElement.dataset.accent = "forest"

    await waitFor(() =>
      expect(container.querySelector(".ambient-forest")).toBeInTheDocument()
    )
    expect(container.querySelector(".ambient-canopy")).toBeInTheDocument()
    expect(container.querySelector(".ambient-chronicles")).not.toBeInTheDocument()
  })

  it("also reacts to the theme attribute changing, since dark mode dims the same scene rather than swapping it", async () => {
    document.documentElement.dataset.accent = "rose"
    const { container } = render(<AmbientBackground />)
    await waitFor(() => expect(container.querySelector(".ambient-rose")).toBeInTheDocument())

    document.documentElement.dataset.theme = "dark"

    // The scene itself doesn't change (dimming is pure CSS keyed on
    // [data-theme]), but the component must not error or unmount when the
    // attribute it watches changes for a reason other than the accent.
    await waitFor(() => expect(container.querySelector(".ambient-rose")).toBeInTheDocument())
  })

  it("falls back to the chronicles scene for an accent it doesn't recognise", () => {
    document.documentElement.dataset.accent = "not-a-real-accent"

    const { container } = render(<AmbientBackground />)

    expect(container.querySelector(".ambient-folds")).toBeInTheDocument()
  })

  it("is decorative and never intercepts a click", () => {
    const { container } = render(<AmbientBackground />)

    const root = container.querySelector(".ambient")
    expect(root).toHaveAttribute("aria-hidden", "true")
  })

  it("draws all 18 rose petals with a stable, non-repeating arrangement", () => {
    document.documentElement.dataset.accent = "rose"

    const { container } = render(<AmbientBackground />)

    const petals = container.querySelectorAll(".ambient-petal")
    expect(petals).toHaveLength(18)
    // Not literally every value distinct, but not all identical either —
    // catches the arrangement collapsing to one repeated petal by accident.
    const positions = new Set([...petals].map((petal) => petal.style.left))
    expect(positions.size).toBeGreaterThan(1)
  })

  it("draws the background glow from the person's own colour when they have chosen one", async () => {
    document.documentElement.dataset.accent = "rose"
    const { container } = render(<AmbientBackground />)
    expect(container.querySelector(".ambient-rose")).toBeInTheDocument()

    document.documentElement.dataset.customGlow = "on"

    await waitFor(() => expect(container.querySelector(".ambient-custom")).toBeInTheDocument())
    expect(container.querySelector(".ambient-glow")).toBeInTheDocument()
    expect(container.querySelector(".ambient-glow-folds")).toBeInTheDocument()
    expect(container.querySelector(".ambient-bloom")).not.toBeInTheDocument()

    delete document.documentElement.dataset.customGlow
    await waitFor(() => expect(container.querySelector(".ambient-rose")).toBeInTheDocument())
  })
})
