import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ScreenReader from "./ScreenReader"
import { readerRate, screenReaderEnabled, setScreenReaderEnabled } from "./speech"

let spoken
let cancelled

beforeEach(() => {
  spoken = []
  cancelled = 0
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  window.speechSynthesis = {
    speak: vi.fn((utterance) => spoken.push(utterance)),
    cancel: vi.fn(() => { cancelled += 1 }),
    pause: vi.fn(),
    resume: vi.fn(),
  }
  window.localStorage.setItem("chronicles-screen-reader", "on")
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
  window.localStorage.clear()
  document.title = ""
})

const said = () => spoken.map((utterance) => utterance.text)
const lastSaid = () => spoken.at(-1)?.text

function page() {
  return render(
    <>
      <ScreenReader />
      <main>
        <h1>Dashboard</h1>
        <p>Welcome back</p>
        <label htmlFor="hours">Hours</label>
        <input id="hours" />
        <button type="button">Save entry</button>
        <h2>Projects</h2>
        <button type="button" aria-pressed="false" onClick={(event) => event.currentTarget.setAttribute("aria-pressed", "true")}>Bold</button>
        <div aria-live="polite" data-testid="live" />
        <div role="alert" data-testid="alert" />
      </main>
    </>
  )
}

describe("ScreenReader", () => {
  it("does nothing, and shows nothing, until it is turned on", () => {
    window.localStorage.clear()
    const { container } = render(<ScreenReader />)
    expect(container).toBeEmptyDOMElement()
    expect(spoken).toHaveLength(0)
  })

  it("says it is on, with the page it is on and how to get help", () => {
    page()
    expect(said()[0]).toBe("Screen reader on. Dashboard Press Alt Shift question mark for keyboard help.")
    expect(screen.getByRole("group", { name: "Screen reader" })).toBeInTheDocument()
  })

  it("reads each control as focus arrives: its name, what it is and what it holds", () => {
    page()
    act(() => screen.getByLabelText("Hours").focus())
    expect(lastSaid()).toBe("Hours, edit text, blank")
    act(() => screen.getByRole("button", { name: "Save entry" }).focus())
    expect(lastSaid()).toBe("Save entry, button")
    // A new announcement interrupts the last one.
    expect(cancelled).toBeGreaterThan(1)
  })

  it("announces a dialog as focus enters it, once", () => {
    render(
      <>
        <ScreenReader />
        <button type="button">Outside</button>
        <div role="dialog" aria-modal="true" aria-label="Share project">
          <button type="button">Done</button>
          <button type="button">Cancel</button>
        </div>
      </>
    )
    act(() => screen.getByRole("button", { name: "Done" }).focus())
    expect(lastSaid()).toBe("Dialog, Share project. Done, button")
    act(() => screen.getByRole("button", { name: "Cancel" }).focus())
    expect(lastSaid()).toBe("Cancel, button")
  })

  it("moves through the page with Alt+Shift+Down and Up, reading each item", () => {
    page()
    const press = (code) => fireEvent.keyDown(document.body, { code, altKey: true, shiftKey: true })

    press("ArrowDown")
    expect(lastSaid()).toBe("Dashboard, heading level 1")
    press("ArrowDown")
    expect(lastSaid()).toBe("Welcome back")
    press("ArrowUp")
    expect(lastSaid()).toBe("Dashboard, heading level 1")
    expect(document.querySelector(".sr-cursor")).toHaveTextContent("Dashboard")
    press("ArrowUp")
    expect(lastSaid()).toBe("Top of page.")
  })

  it("focuses controls it lands on, and says so once", () => {
    page()
    const press = () => fireEvent.keyDown(document.body, { code: "ArrowDown", altKey: true, shiftKey: true })
    press(); press(); press(); press() // heading, paragraph, label, input
    expect(document.activeElement).toBe(screen.getByLabelText("Hours"))
    expect(said().filter((text) => text.startsWith("Hours, edit text"))).toHaveLength(1)
  })

  it("jumps between headings", () => {
    page()
    const press = (code) => fireEvent.keyDown(document.body, { code, altKey: true, shiftKey: true })

    press("KeyH")
    expect(lastSaid()).toBe("Dashboard, heading level 1")
    press("KeyH")
    expect(lastSaid()).toBe("Projects, heading level 2")
    press("KeyH")
    expect(lastSaid()).toBe("No more headings.")
    press("KeyJ")
    expect(lastSaid()).toBe("Dashboard, heading level 1")
    press("KeyJ")
    expect(lastSaid()).toBe("No earlier headings.")
  })

  it("reads on from where you are", () => {
    page()
    fireEvent.keyDown(document.body, { code: "ArrowDown", altKey: true, shiftKey: true })
    const before = spoken.length

    fireEvent.keyDown(document.body, { code: "KeyR", altKey: true, shiftKey: true })

    const queued = said().slice(before)
    expect(queued[0]).toBe("Welcome back")
    expect(queued).toContain("Save entry, button")
    expect(queued).toContain("Projects, heading level 2")
  })

  it("reads the page title and the keyboard help on request", () => {
    document.title = "Chronicles: Dashboard"
    page()

    fireEvent.keyDown(document.body, { code: "KeyT", altKey: true, shiftKey: true })
    expect(lastSaid()).toBe("Chronicles: Dashboard")

    fireEvent.keyDown(document.body, { code: "Slash", altKey: true, shiftKey: true })
    expect(said().join(" ")).toContain("Alt Shift Down arrow and Up arrow")
  })

  it("stops speaking on Escape or Control", () => {
    page()
    const before = cancelled

    fireEvent.keyDown(document.body, { key: "Escape" })
    fireEvent.keyDown(document.body, { key: "Control" })

    expect(cancelled).toBe(before + 2)
  })

  it("speeds up and slows down, and remembers it", () => {
    page()
    fireEvent.keyDown(document.body, { code: "Equal", altKey: true, shiftKey: true })
    expect(lastSaid()).toBe("Speed 1.1")
    expect(readerRate()).toBe(1.1)
    expect(spoken.at(-1).rate).toBe(1.1)
    fireEvent.keyDown(document.body, { code: "Minus", altKey: true, shiftKey: true })
    fireEvent.keyDown(document.body, { code: "Minus", altKey: true, shiftKey: true })
    expect(readerRate()).toBe(0.9)
  })

  it("echoes what is typed, hides passwords, and stays quiet elsewhere", () => {
    render(
      <>
        <ScreenReader />
        <input aria-label="Title" />
        <input aria-label="Secret" type="password" />
        <button type="button">Go</button>
      </>
    )
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "a" })
    expect(lastSaid()).toBe("a")
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: " " })
    expect(lastSaid()).toBe("space")
    fireEvent.keyDown(screen.getByLabelText("Secret"), { key: "x" })
    expect(lastSaid()).toBe("star")

    const count = spoken.length
    fireEvent.keyDown(screen.getByRole("button", { name: "Go" }), { key: "g" })
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "c", ctrlKey: true })
    expect(spoken).toHaveLength(count)
  })

  it("says a control's new state after it is pressed", async () => {
    page()
    fireEvent.click(screen.getByRole("button", { name: "Bold" }))
    await waitFor(() => expect(lastSaid()).toBe("pressed"))
  })

  it("announces live regions when their text changes, once per change", async () => {
    page()
    const live = screen.getByTestId("live")

    act(() => { live.textContent = "Entry saved." })
    await waitFor(() => expect(said()).toContain("Entry saved."))
    const count = spoken.length
    act(() => { live.textContent = "Entry saved." })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(spoken).toHaveLength(count)
  })

  it("interrupts for an alert, and waits for a status", async () => {
    page()
    act(() => { screen.getByTestId("alert").textContent = "Could not save." })
    await waitFor(() => expect(said()).toContain("Could not save."))
    expect(spoken.at(-1).text).toBe("Could not save.")
  })

  it("ignores a live region that is still busy", async () => {
    page()
    const live = screen.getByTestId("live")
    live.setAttribute("aria-busy", "true")
    act(() => { live.textContent = "Half a reply" })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(said()).not.toContain("Half a reply")
  })

  it("announces a new page when its heading changes", async () => {
    page()
    act(() => { document.querySelector("h1").textContent = "Today" })
    await waitFor(() => expect(said()).toContain("Page, Today"))
  })

  it("can be turned off from its badge, and then falls silent", () => {
    page()
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }))

    expect(screenReaderEnabled()).toBe(false)
    expect(screen.queryByRole("group", { name: "Screen reader" })).not.toBeInTheDocument()
    const count = spoken.length
    act(() => screen.getByLabelText("Hours").focus())
    expect(spoken).toHaveLength(count)
  })

  it("starts when it is switched on from the profile", () => {
    window.localStorage.clear()
    page()
    expect(spoken).toHaveLength(0)

    act(() => setScreenReaderEnabled(true))

    expect(said()[0]).toContain("Screen reader on")
  })

  it("picks up a new speed chosen in the profile", () => {
    page()
    act(() => { window.dispatchEvent(new CustomEvent("chronicles-screen-reader-change", { detail: { rate: 1.6 } })) })
    act(() => screen.getByRole("button", { name: "Save entry" }).focus())
    expect(spoken.at(-1).rate).toBe(1.6)
  })

  it("does nothing where the browser has no speech", () => {
    delete window.speechSynthesis
    const { container } = render(<ScreenReader />)
    expect(container).toBeEmptyDOMElement()
  })
})
