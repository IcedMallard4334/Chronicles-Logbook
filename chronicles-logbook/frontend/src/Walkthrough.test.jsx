import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Walkthrough from "./Walkthrough"
import { WALKTHROUGHS, clock } from "./walkthroughs"

const duration = WALKTHROUGHS["first-logbook"].duration
const total = clock(duration)
let now = 0
let frames = new Map()
let nextFrame = 0

beforeEach(() => {
  now = 0
  frames = new Map()
  vi.spyOn(performance, "now").mockImplementation(() => now)
  vi.stubGlobal("requestAnimationFrame", (callback) => { nextFrame += 1; frames.set(nextFrame, callback); return nextFrame })
  vi.stubGlobal("cancelAnimationFrame", (id) => { frames.delete(id) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Lets the given number of seconds pass, one frame at a time. */
function watch(seconds) {
  const step = 0.25
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    now += step * 1000
    const due = [...frames.values()]
    frames = new Map()
    act(() => due.forEach((callback) => callback(now)))
  }
}

const scrub = () => screen.getByRole("slider", { name: "Position in the walkthrough" })
/** The app as it is drawn inside the video. */
const picture = () => document.querySelector(".wt-iframe").contentDocument
const caption = () => document.querySelector(".wt-caption")
const seek = (seconds) => fireEvent.change(scrub(), { target: { value: String(seconds) } })

describe("Walkthrough", () => {
  it("shows nothing for a walkthrough that does not exist", () => {
    const { container } = render(<Walkthrough id="nope" />)

    expect(container).toBeEmptyDOMElement()
  })

  it("waits to be played: a poster says what it is, how long, and that there is no sound", () => {
    render(<Walkthrough id="first-logbook" />)

    const poster = screen.getByRole("button", { name: "Play the walkthrough: Making your first logbook" })
    expect(poster).toHaveTextContent("About a minute · no sound · captions on screen")
    expect(screen.getByText(`0:00 / ${total}`)).toBeInTheDocument()
    expect(scrub()).toHaveValue("0")
  })

  it("draws the real app, not a picture of it: its own markup and classes, in a frame", () => {
    render(<Walkthrough id="first-logbook" />)

    const app = picture()
    expect(app.querySelector(".topbar .nav-pill")).not.toBeNull()
    expect(app.querySelector(".nav-pill-center")).toHaveTextContent("HomeMiraAll EntriesAll TasksBoardCalendarStatistics")
    expect(app.querySelector(".workspace-sidebar")).toHaveTextContent("No projects yet.")
    expect(app.querySelector(".empty-logo-hero h2")).toHaveTextContent("Welcome to Chronicles")
    expect(app.querySelector('[data-target="create-first"]')).toHaveClass("btn-primary")
  })

  it("gives the frame the page's stylesheets and theme", () => {
    document.head.insertAdjacentHTML("beforeend", "<style id='probe'>.probe { color: red }</style>")
    document.documentElement.setAttribute("data-theme", "dark")
    render(<Walkthrough id="first-logbook" />)

    expect(picture().head.innerHTML).toContain(".probe { color: red }")
    expect(picture().documentElement.getAttribute("data-theme")).toBe("dark")
    document.getElementById("probe").remove()
    document.documentElement.removeAttribute("data-theme")
  })

  it("plays when asked, moves on with time, and pauses", () => {
    render(<Walkthrough id="first-logbook" />)

    fireEvent.click(screen.getByRole("button", { name: /Play the walkthrough/ }))
    watch(9.5)
    expect(screen.queryByRole("button", { name: /Play the walkthrough/ })).not.toBeInTheDocument()
    expect(screen.getByText(`0:09 / ${total}`)).toBeInTheDocument()
    expect(caption()).toHaveTextContent("A panel slides in from the side")

    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    watch(5)
    expect(screen.getByText(`0:09 / ${total}`)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
  })

  it("can be moved through like a video, showing the app and the words for that moment", () => {
    render(<Walkthrough id="first-logbook" />)

    seek(24)
    expect(scrub()).toHaveAttribute("aria-valuetext", `0:24 of ${total}`)
    expect(caption()).toHaveTextContent(/title and the time it took are built in/)
    // The new-project panel is open, with the built-in fields greyed out in it.
    expect(picture().querySelector(".drawer .drawer-heading h2")).toHaveTextContent("Start a new project")
    expect(picture().querySelector(".built-in-fields .field-card.is-locked")).not.toBeNull()
    expect(picture().querySelector(".wt-group.is-lit")).not.toBeNull()

    seek(66)
    expect(picture().querySelector(".drawer")).toBeNull()
    expect(picture().querySelector(".log-row")).toHaveTextContent("Leg day")
    expect(picture().querySelector(".rule-applied-notice")).toHaveTextContent("Entry saved.")

    // And back again.
    seek(2)
    expect(picture().querySelector(".log-row")).toBeNull()
    expect(picture().querySelector(".empty-logo-hero")).not.toBeNull()
  })

  it("makes room for the panel the way the app does: the page moves over and the top bar shrinks", () => {
    render(<Walkthrough id="first-logbook" />)

    seek(24)
    expect(picture().documentElement).toHaveClass("has-drawer", "drawer-compact")
    expect(picture().documentElement.style.getPropertyValue("--drawer-inset")).toBe("520px")

    seek(55)
    expect(picture().documentElement).not.toHaveClass("has-drawer")
  })

  it("adds the field from further down the panel, as in the app, and then shows it", () => {
    render(<Walkthrough id="first-logbook" />)

    seek(14)
    expect(picture().querySelector(".drawer-body")).not.toBeNull()
    expect(picture().querySelector('[data-target="add-field"]')).toHaveTextContent("Add field")
    expect(picture().querySelector(".wt-new-field")).toBeNull()

    seek(47)
    const added = picture().querySelector(".wt-new-field")
    expect(added.querySelector("input[type=text]").value).toBe("Weight (kg)")
    expect(added.querySelector("select").value).toBe("number")
  })

  it("stops itself at the end and offers to play again from the start", () => {
    render(<Walkthrough id="first-logbook" />)
    seek(duration - 1)

    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    watch(3)

    expect(screen.getByText(`${total} / ${total}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Replay" }))
    watch(1)
    expect(screen.getByText(`0:01 / ${total}`)).toBeInTheDocument()
  })

  it("shows a click while the cursor presses a button, and a typed answer filling in", () => {
    render(<Walkthrough id="first-logbook" />)

    seek(5.3)
    expect(picture().querySelector(".wt-cursor")).toHaveClass("is-clicking")

    seek(9.6)
    const typed = picture().querySelector('[data-target="name"] textarea').value
    expect(typed).toMatch(/^Gym/)
    expect(typed.length).toBeLessThan("Gym log".length + 1)
  })

  it("offers the same words as text for anyone who would rather read them", () => {
    render(<Walkthrough id="first-logbook" />)

    fireEvent.click(screen.getByText("Read it instead"))

    const lines = screen.getAllByRole("listitem")
    expect(lines.length).toBeGreaterThanOrEqual(10)
    expect(lines[0]).toHaveTextContent("A logbook starts as a project")
  })

  it("keeps the picture out of the way of assistive technology, which gets the controls and the words", () => {
    render(<Walkthrough id="first-logbook" />)

    expect(document.querySelector(".wt-stage")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByRole("figure", { name: "Walkthrough: Making your first logbook" })).toBeInTheDocument()
  })
})

describe.each(Object.keys(WALKTHROUGHS))("the %s walkthrough", (id) => {
  const script = WALKTHROUGHS[id]
  const find = (target) => (/^[.[#]/.test(target) ? picture().querySelector(target) : picture().querySelector(`[data-target="${target}"]`))

  it("has a picture to draw, steps in time order inside its length, and words for each step", () => {
    render(<Walkthrough id={id} />)

    expect(document.querySelector(".wt-iframe")).not.toBeNull()
    const times = script.steps.map((step) => step.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(Math.max(...times)).toBeLessThan(script.duration)
    expect(script.duration).toBeGreaterThanOrEqual(40)
    expect(script.duration).toBeLessThanOrEqual(75)
    expect(script.steps.filter((step) => step.caption).length).toBeGreaterThanOrEqual(6)
  })

  it("only ever points the cursor at something that is on screen at that moment", () => {
    render(<Walkthrough id={id} />)

    const missing = []
    for (const step of script.steps.filter((entry) => entry.target)) {
      seek(step.at + 0.05)
      if (!find(step.target)) missing.push(`${step.at}s: ${step.target}`)
    }
    expect(missing).toEqual([])
  })

  it("can be played from the first moment to the last without a problem", () => {
    render(<Walkthrough id={id} />)

    for (let at = 0; at <= script.duration; at += 1.5) seek(at)
    seek(script.duration)

    expect(screen.getByText(`${clock(script.duration)} / ${clock(script.duration)}`)).toBeInTheDocument()
  })
})
