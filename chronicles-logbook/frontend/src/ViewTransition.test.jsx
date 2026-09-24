import { render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"

import ViewTransition, { SkeletonRows, ViewLoader } from "./ViewTransition"

describe("ViewTransition", () => {
  it("renders its children", () => {
    render(
      <ViewTransition viewKey="a">
        <p>Today's view</p>
      </ViewTransition>
    )

    expect(screen.getByText("Today's view")).toBeInTheDocument()
  })

  it("remounts the incoming view when viewKey changes", () => {
    // A change in mount count — not just an update — is what restarts the
    // CSS entrance animation from its first frame, since `key` is the whole
    // mechanism here: no state or timers to fake.
    const onMount = vi.fn()
    function Probe() {
      useEffect(onMount, [])
      return <p>view</p>
    }

    const { rerender } = render(
      <ViewTransition viewKey="a">
        <Probe />
      </ViewTransition>
    )
    expect(onMount).toHaveBeenCalledTimes(1)

    rerender(
      <ViewTransition viewKey="a">
        <Probe />
      </ViewTransition>
    )
    expect(onMount).toHaveBeenCalledTimes(1) // same key: no remount

    rerender(
      <ViewTransition viewKey="b">
        <Probe />
      </ViewTransition>
    )
    expect(onMount).toHaveBeenCalledTimes(2) // different key: remounted
  })
})

describe("ViewLoader", () => {
  it("shows immediately when delay is 0", () => {
    render(<ViewLoader label="Opening your logbook…" delay={0} />)

    expect(screen.getByRole("status")).toHaveTextContent("Opening your logbook…")
  })

  it("stays hidden at first, then appears once the delay passes — so a fast response never flashes it", async () => {
    render(<ViewLoader label="Loading entries…" delay={20} />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    expect(await screen.findByRole("status")).toHaveTextContent("Loading entries…")
  })

  it("is announced politely rather than interrupting", () => {
    render(<ViewLoader delay={0} />)

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
  })
})

describe("SkeletonRows", () => {
  it("renders the requested number of placeholder rows", () => {
    const { container } = render(<SkeletonRows rows={4} label="Loading entries" />)

    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(4)
    expect(screen.getByRole("status", { name: "Loading entries" })).toBeInTheDocument()
  })

  it("defaults to three rows", () => {
    const { container } = render(<SkeletonRows />)

    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(3)
  })
})
