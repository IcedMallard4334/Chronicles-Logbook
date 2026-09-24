/**
 * Guidance that arrives when somebody is looking at the thing being explained.
 *
 * The rule under test is that it is offered once and then stays out of the
 * way: a tour that reappears is worse than no tour, and one that cannot be
 * dismissed is worse still.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PageHint, WelcomeTour } from "./GuidedTour"
import { PAGE_TOURS, WELCOME_TOUR, markTourSeen, resetTours, seenTours } from "./tourSteps"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("chronicles_user", JSON.stringify({ id: "u1" }))
})

describe("remembering what has been shown", () => {
  it("starts with nothing seen", () => {
    expect(seenTours()).toEqual([])
  })

  it("remembers a tour once it has been shown", () => {
    markTourSeen("welcome")

    expect(seenTours()).toContain("welcome")
  })

  it("keeps each account's guidance separate", () => {
    markTourSeen("welcome")
    window.localStorage.setItem("chronicles_user", JSON.stringify({ id: "u2" }))

    expect(seenTours()).toEqual([])
  })

  it("can be cleared, so the tour is not a one-time-only offer", () => {
    markTourSeen("welcome")
    markTourSeen("page-home")

    resetTours()

    expect(seenTours()).toEqual([])
  })

  it("survives storage being unavailable", () => {
    // Private windows and blocked site data both make this throw, and a page
    // that cannot render because guidance failed is a far worse outcome.
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked")
      })

    expect(seenTours()).toEqual([])
    expect(() => markTourSeen("welcome")).not.toThrow()

    getItem.mockRestore()
  })
})

describe("the welcome tour", () => {
  it("opens on the first step", () => {
    render(<WelcomeTour tour={WELCOME_TOUR} onFinish={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "This is your logbook" })).toBeInTheDocument()
  })

  it("steps through the ones whose anchors are on screen", () => {
    // Two anchors present, so the tour is two steps long rather than four.
    const nav = document.createElement("nav")
    nav.className = "nav-pill-center"
    nav.textContent = "nav"
    Object.assign(nav.style, { width: "200px", height: "40px" })
    nav.getBoundingClientRect = () => ({ width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 })
    document.body.appendChild(nav)

    render(<WelcomeTour tour={WELCOME_TOUR} onFinish={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Show me" }))
    expect(screen.getByRole("heading", { name: "Every view, across every project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument()

    nav.remove()
  })

  it("finishes when dismissed, so it is not offered again", () => {
    const onFinish = vi.fn()
    render(<WelcomeTour tour={WELCOME_TOUR} onFinish={onFinish} />)

    fireEvent.click(screen.getByRole("button", { name: /Skip|Got it/ }))

    expect(onFinish).toHaveBeenCalled()
    expect(seenTours()).toContain(WELCOME_TOUR.id)
  })

  it("finishes on Escape, because guidance has to be escapable", () => {
    const onFinish = vi.fn()
    render(<WelcomeTour tour={WELCOME_TOUR} onFinish={onFinish} />)

    fireEvent.keyDown(window, { key: "Escape" })

    expect(onFinish).toHaveBeenCalled()
  })

  it("skips a step whose anchor is not on screen", () => {
    // jsdom renders no app around this, so every anchored step is dropped and
    // only the deliberately unanchored opening card remains.
    render(<WelcomeTour tour={WELCOME_TOUR} onFinish={vi.fn()} />)

    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
  })
})

describe("a page's first-visit hint", () => {
  it("explains the page it is attached to", () => {
    render(<PageHint hint={PAGE_TOURS.timeline} onDismiss={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Your record, end to end" })).toBeInTheDocument()
  })

  it("does not block the page it is describing", () => {
    // No scrim: this arrives while somebody is already doing something.
    const { container } = render(<PageHint hint={PAGE_TOURS.entries} onDismiss={vi.fn()} />)

    expect(container.querySelector(".tour-scrim")).toBeNull()
  })

  it("is dismissed once and remembered", () => {
    const onDismiss = vi.fn()
    render(<PageHint hint={PAGE_TOURS.entries} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole("button", { name: "Got it" }))

    expect(onDismiss).toHaveBeenCalled()
    expect(seenTours()).toContain(PAGE_TOURS.entries.id)
  })
})
