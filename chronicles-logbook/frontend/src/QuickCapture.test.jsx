/**
 * Capture, from anywhere, in seconds.
 *
 * The brief: "an entry that takes a minute to file will not be filed.
 * Recording what was just done should be a keyboard away, with anything
 * predictable already filled in." What is tested here is both halves of that —
 * that it opens from the keyboard, and that "predictable" means remembered
 * rather than invented.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({ createEntry: vi.fn() }))

import QuickCapture, { OPEN_QUICK_CAPTURE, initialValues } from "./QuickCapture"
import { createEntry } from "./api"

const NOTE = { id: "note", name: "What I did", type: "text" }
const HOURS = { id: "hours", name: "Hours", type: "number" }
const STAGE = {
  id: "stage",
  name: "Stage",
  type: "dropdown",
  options: ["Reading", "Writing"],
}
const TAGS = { id: "tags", name: "Topics", type: "tags" }
const WHEN = { id: "when", name: "Observed on", type: "date" }

const thesis = {
  id: "p1",
  name: "Thesis",
  archived: false,
  entry_schema: [NOTE, HOURS, STAGE, TAGS, WHEN],
}
const lab = { id: "p2", name: "Lab Book", archived: false, entry_schema: [NOTE] }
const old = { id: "p3", name: "Finished", archived: true, entry_schema: [NOTE] }

function open(props = {}) {
  const handlers = { onCaptured: vi.fn(), onOpenProject: vi.fn(), ...props }
  render(<QuickCapture projects={[thesis, lab, old]} {...handlers} />)
  fireEvent(window, new Event(OPEN_QUICK_CAPTURE))
  return handlers
}

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
  createEntry.mockResolvedValue({ id: "e1", project_id: "p1", data: {} })
})

describe("opening it", () => {
  it("stays out of the way until asked for", () => {
    render(<QuickCapture projects={[thesis]} />)

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens on Ctrl+Enter from anywhere", () => {
    render(<QuickCapture projects={[thesis]} />)

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true })

    expect(screen.getByRole("dialog", { name: "What did you just do?" })).toBeInTheDocument()
  })

  it("closes on Escape", () => {
    open()

    fireEvent.keyDown(window, { key: "Escape" })

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not offer to capture into an archived project", () => {
    open()

    const options = [...screen.getByLabelText("Project").options].map((o) => o.textContent)
    expect(options).toEqual(["Thesis", "Lab Book"])
  })

  it("opens into the project you wrote in last", () => {
    window.localStorage.setItem("chronicles-last-project", "p2")
    open()

    expect(screen.getByLabelText("Project")).toHaveValue("p2")
  })
})

describe("what is already filled in", () => {
  it("starts a date field on today, because an entry filed now is about now", () => {
    const today = new Date().toLocaleDateString("en-CA")

    expect(initialValues(thesis).when).toBe(today)
  })

  it("leaves text and numbers blank", () => {
    // These are the things you are here to record; offering yesterday's answer
    // is how a logbook fills up with work nobody did.
    const values = initialValues(thesis)

    expect(values.note).toBeUndefined()
    expect(values.hours).toBeUndefined()
  })

  it("offers the choice and tags you used last time in this project", async () => {
    open()

    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "Writing" } })
    fireEvent.change(screen.getByLabelText("Topics"), { target: { value: "chapter-3" } })
    fireEvent.keyDown(screen.getByLabelText("Topics"), { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())

    // Entries come in runs: the second one about chapter 3 is usually also
    // about chapter 3.
    const values = initialValues(thesis)
    expect(values.stage).toBe("Writing")
    expect(values.tags).toEqual(["chapter-3"])
  })

  it("brings a checklist back with its steps but not its ticks", async () => {
    // A repeated piece of work repeats its steps; it does not arrive already
    // half done.
    const STEPS = { id: "steps", name: "Steps", type: "checklist" }
    const withSteps = { ...thesis, entry_schema: [NOTE, STEPS] }
    render(<QuickCapture projects={[withSteps]} onCaptured={vi.fn()} />)
    fireEvent(window, new Event(OPEN_QUICK_CAPTURE))

    const box = screen.getByLabelText("Steps")
    fireEvent.change(box, { target: { value: "Outline" } })
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.click(screen.getByRole("checkbox", { name: "" }) ?? screen.getAllByRole("checkbox")[0])
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(createEntry).toHaveBeenCalled())

    expect(initialValues(withSteps).steps).toEqual([
      { id: expect.any(String), text: "Outline", completed: false },
    ])
  })

  it("keeps each project's memory separate", async () => {
    open()
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "Reading" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))
    await waitFor(() => expect(createEntry).toHaveBeenCalled())

    expect(initialValues(lab)).toEqual({})
  })
})

describe("saving", () => {
  it("writes the entry and tells the workspace", async () => {
    const handlers = open()

    fireEvent.change(screen.getByLabelText("What I did"), {
      target: { value: "Reran the calibration" },
    })
    fireEvent.change(screen.getByLabelText("Hours spent"), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText("Minutes spent"), { target: { value: "30" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() =>
      expect(createEntry).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          data: expect.objectContaining({ note: "Reran the calibration" }),
          time_spent: 90,
          todo: false,
        })
      )
    )
    expect(handlers.onCaptured).toHaveBeenCalled()
  })

  it("saves on Ctrl+Enter from inside the box", async () => {
    open()

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", ctrlKey: true })

    await waitFor(() => expect(createEntry).toHaveBeenCalled())
  })

  it("stays open and ready for the next one", async () => {
    open()

    fireEvent.change(screen.getByLabelText("What I did"), { target: { value: "One" } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    expect(await screen.findByRole("status")).toHaveTextContent("Saved to")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("What I did")).toHaveValue("")
  })

  it("reports a refused save rather than claiming it worked", async () => {
    createEntry.mockRejectedValue(new Error("Missing required field: Hours"))
    const handlers = open()

    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Missing required field")
    expect(handlers.onCaptured).not.toHaveBeenCalled()
  })

  it("says where to start when there is nowhere to capture to", () => {
    render(<QuickCapture projects={[]} />)
    fireEvent(window, new Event(OPEN_QUICK_CAPTURE))

    expect(screen.getByText(/There is nowhere to capture to yet/)).toBeInTheDocument()
  })
})
