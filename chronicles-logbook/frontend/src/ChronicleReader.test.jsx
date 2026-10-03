import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import ChronicleReader from "./ChronicleReader"
import { CHRONICLES } from "./learningContent"

function renderReader(chronicleId) {
  return render(
    <MemoryRouter initialEntries={[`/learning/${chronicleId}`]}>
      <Routes>
        <Route path="/learning/:chronicleId" element={<ChronicleReader />} />
        <Route path="/learning" element={<p>Learning hub</p>} />
        <Route path="/app" element={<p>Workspace</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("ChronicleReader", () => {
  it("opens on the first lesson, with a progress indicator", () => {
    const chronicle = CHRONICLES[0]
    renderReader(chronicle.id)

    expect(screen.getByRole("heading", { name: chronicle.title })).toBeInTheDocument()
    expect(screen.getByText(chronicle.lessons[0].title)).toBeInTheDocument()
    expect(screen.getByText(`Lesson 1 of ${chronicle.lessons.length}`)).toBeInTheDocument()
  })

  it("moves through lessons with Next and Previous", () => {
    const chronicle = CHRONICLES[0]
    renderReader(chronicle.id)

    fireEvent.click(screen.getByRole("button", { name: "Next →" }))
    expect(screen.getByText(chronicle.lessons[1].title)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "← Previous" })).not.toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "← Previous" }))
    expect(screen.getByText(chronicle.lessons[0].title)).toBeInTheDocument()
  })

  it("shows completion once the last lesson is reached, with a way back", () => {
    const chronicle = CHRONICLES[0]
    renderReader(chronicle.id)

    // Click through to the final lesson.
    for (let i = 0; i < chronicle.lessons.length - 1; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next →" }))
    }

    expect(screen.getByText("You've completed this guide")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Next →" })).not.toBeInTheDocument()

    // The top bar has a back arrow with the same name; the one in the footer is last.
    fireEvent.click(screen.getAllByRole("button", { name: "Back to Learning Chronicles" }).at(-1))
    expect(screen.getByText("Learning hub")).toBeInTheDocument()
  })

  it("offers the next guide from the completion screen when there is one", () => {
    const chronicle = CHRONICLES[0]
    const next = CHRONICLES[1]
    renderReader(chronicle.id)

    for (let i = 0; i < chronicle.lessons.length - 1; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next →" }))
    }

    expect(screen.getByRole("button", { name: `Next guide: ${next.title} →` })).toBeInTheDocument()
  })

  it("restarts at the first lesson when the completion screen sends you to the next guide", () => {
    const [first, second] = CHRONICLES
    render(
      <MemoryRouter initialEntries={[`/learning/${first.id}`]}>
        <Routes>
          <Route path="/learning/:chronicleId" element={<ChronicleReader />} />
        </Routes>
      </MemoryRouter>
    )

    for (let i = 0; i < first.lessons.length - 1; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next →" }))
    }
    fireEvent.click(screen.getByRole("button", { name: `Next guide: ${second.title} →` }))

    expect(screen.getByRole("heading", { name: second.title })).toBeInTheDocument()
    expect(screen.getByText(second.lessons[0].title)).toBeInTheDocument()
  })

  it("shows a not-found message for an unknown chronicle id", () => {
    renderReader("not-a-real-chronicle")

    expect(screen.getByText("We couldn't find that guide")).toBeInTheDocument()
  })
})
