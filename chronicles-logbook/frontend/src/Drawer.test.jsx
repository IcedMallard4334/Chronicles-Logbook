import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Drawer, { DRAWER_DEFAULT_WIDTH, DRAWER_MIN_WIDTH, clampDrawerWidth } from "./Drawer"

const root = document.documentElement

// jsdom has no PointerEvent, so a pointer event would lose its coordinates and button.
class FakePointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}
window.PointerEvent = FakePointerEvent

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1400 })
})

afterEach(() => {
  root.classList.remove("has-drawer", "drawer-compact", "drawer-resizing")
  root.style.removeProperty("--drawer-inset")
})

const open = (props = {}) =>
  render(
    <Drawer title="Edit thing" subtitle="A subtitle" onClose={props.onClose ?? vi.fn()} closeLabel="Close thing" {...props}>
      <input aria-label="First" />
      <button type="button">Second</button>
    </Drawer>
  )

describe("Drawer", () => {
  it("is a named, non-modal dialog docked to <body>, with the page left usable", () => {
    const { container } = render(
      <div id="caller">
        <Drawer title="Edit thing" onClose={vi.fn()}>body</Drawer>
      </div>
    )

    const dialog = screen.getByRole("dialog", { name: "Edit thing" })
    expect(dialog).toHaveAttribute("aria-modal", "false")
    expect(dialog.parentElement).toBe(document.body)
    expect(container.querySelector(".drawer")).not.toBeInTheDocument()
    // No backdrop covers the page.
    expect(document.querySelector(".modal-backdrop")).not.toBeInTheDocument()
  })

  it("shows its title and subtitle, and closes from the button", () => {
    const onClose = vi.fn()
    open({ onClose })

    expect(screen.getByRole("heading", { name: "Edit thing" })).toBeInTheDocument()
    expect(screen.getByText("A subtitle")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close thing" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("moves focus to the first control, and gives it back to the opener when it closes", () => {
    const opener = document.createElement("button")
    document.body.append(opener)
    opener.focus()

    const { unmount } = open()
    expect(screen.getByLabelText("First")).toHaveFocus()

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it("closes on Escape pressed inside it only, so the page beside it keeps its own Escape", () => {
    const onClose = vi.fn()
    open({ onClose })

    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText("First"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("makes room for itself beside the page while it is open, and gives the room back", () => {
    const { unmount } = open()

    expect(root).toHaveClass("has-drawer")
    expect(root.style.getPropertyValue("--drawer-inset")).toBe(`${DRAWER_DEFAULT_WIDTH}px`)

    unmount()
    expect(root).not.toHaveClass("has-drawer")
    expect(root.style.getPropertyValue("--drawer-inset")).toBe("")
  })

  it("keeps the page's room until the last of two drawers closes", () => {
    const first = open()
    const second = render(<Drawer title="Another" onClose={vi.fn()}>x</Drawer>)

    first.unmount()
    expect(root).toHaveClass("has-drawer")
    second.unmount()
    expect(root).not.toHaveClass("has-drawer")
  })

  it("tells a busy drawer apart, for the progress bar and for assistive technology", () => {
    open({ busy: true })

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true")
    expect(document.querySelector(".drawer-progress")).toHaveClass("is-busy")
  })

  it("compacts the top bar when the drawer leaves little room for the page", () => {
    open()
    // 1400 - 520 leaves less than a comfortable page.
    expect(root).toHaveClass("drawer-compact")
  })

  describe("resizing", () => {
    const handle = () => screen.getByRole("separator", { name: "Resize panel" })

    it("exposes its width to assistive technology", () => {
      open()

      expect(handle()).toHaveAttribute("aria-orientation", "vertical")
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH))
      expect(handle()).toHaveAttribute("aria-valuemin", String(DRAWER_MIN_WIDTH))
    })

    it("widens and narrows from the arrow keys, and remembers the width", () => {
      open()

      fireEvent.keyDown(handle(), { key: "ArrowLeft" })
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH + 24))
      fireEvent.keyDown(handle(), { key: "ArrowRight", shiftKey: true })
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH + 24 - 72))
      expect(window.localStorage.getItem("chronicles-drawer-width")).toBe(String(DRAWER_DEFAULT_WIDTH - 48))
      expect(root.style.getPropertyValue("--drawer-inset")).toBe(`${DRAWER_DEFAULT_WIDTH - 48}px`)
    })

    it("goes to its narrowest and widest with End and Home", () => {
      open()

      fireEvent.keyDown(handle(), { key: "End" })
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_MIN_WIDTH))
      fireEvent.keyDown(handle(), { key: "Home" })
      expect(Number(handle().getAttribute("aria-valuenow"))).toBeGreaterThan(DRAWER_DEFAULT_WIDTH)
    })

    it("follows the pointer while dragging, and keeps the width it ended on", () => {
      open()

      fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 880 })
      expect(root).toHaveClass("drawer-resizing")
      fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 700 })
      expect(handle()).toHaveAttribute("aria-valuenow", "700")
      fireEvent.pointerUp(handle(), { pointerId: 1 })

      expect(root).not.toHaveClass("drawer-resizing")
      expect(window.localStorage.getItem("chronicles-drawer-width")).toBe("700")
    })

    it("ignores pointer movement when no drag has begun", () => {
      open()

      fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 300 })

      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH))
    })

    it("never goes narrower than a form needs, or so wide the page disappears", () => {
      open()

      fireEvent.pointerDown(handle(), { pointerId: 1, button: 0 })
      fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 1390 })
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_MIN_WIDTH))
      fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 0 })
      // 1400 wide leaves at least 320 for the page.
      expect(Number(handle().getAttribute("aria-valuenow"))).toBeLessThanOrEqual(960)
      fireEvent.pointerUp(handle(), { pointerId: 1 })
    })

    it("goes back to the default width on a double click", () => {
      open()
      fireEvent.keyDown(handle(), { key: "ArrowLeft" })

      fireEvent.doubleClick(handle())

      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH))
    })

    it("opens at the width it was last left at", () => {
      window.localStorage.setItem("chronicles-drawer-width", "640")

      open()

      expect(handle()).toHaveAttribute("aria-valuenow", "640")
    })

    it("falls back to the default when the saved width is rubbish or storage is blocked", () => {
      window.localStorage.setItem("chronicles-drawer-width", "wide")
      const { unmount } = open()
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH))
      unmount()

      const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
      open()
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH))
      fireEvent.keyDown(handle(), { key: "ArrowLeft" })
      expect(handle()).toHaveAttribute("aria-valuenow", String(DRAWER_DEFAULT_WIDTH + 24))
      getItem.mockRestore()
      setItem.mockRestore()
    })

    it("refits itself when the window shrinks under it", () => {
      window.localStorage.setItem("chronicles-drawer-width", "900")
      open()
      expect(handle()).toHaveAttribute("aria-valuenow", "900")

      act(() => {
        window.innerWidth = 800
        window.dispatchEvent(new Event("resize"))
      })

      expect(Number(handle().getAttribute("aria-valuenow"))).toBeLessThanOrEqual(480)
    })

    it("ignores a right click on the edge", () => {
      open()

      fireEvent.pointerDown(handle(), { pointerId: 1, button: 2 })

      expect(root).not.toHaveClass("drawer-resizing")
    })
  })
})

describe("clampDrawerWidth", () => {
  it("keeps a width in range and falls back for anything that is not a number", () => {
    expect(clampDrawerWidth(10)).toBe(DRAWER_MIN_WIDTH)
    expect(clampDrawerWidth(500.4)).toBe(500)
    expect(clampDrawerWidth("nonsense")).toBe(DRAWER_DEFAULT_WIDTH)
    expect(clampDrawerWidth(99999)).toBeLessThanOrEqual(960)
  })
})
