import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import LearningChronicles from "./LearningChronicles"
import { CHRONICLES } from "./learningContent"

function renderGrid(variant) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<LearningChronicles variant={variant} />} />
        <Route path="/learning" element={<p>Learning hub</p>} />
        <Route path="/learning/:chronicleId" element={<p>Chronicle reader</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("LearningChronicles", () => {
  it("shows a preview of cards with an explore-all link on Home", () => {
    renderGrid("home")

    expect(screen.getByText("Learn how to get the most out of your digital logbook")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Explore all Learning Chronicles/ })).toBeInTheDocument()
    // Home shows the first four as cards; the rest wait in the full hub.
    for (const chronicle of CHRONICLES.slice(0, 4)) {
      expect(screen.getByText(chronicle.title)).toBeInTheDocument()
    }
    for (const chronicle of CHRONICLES.slice(4)) {
      expect(screen.queryByText(chronicle.title)).not.toBeInTheDocument()
    }
  })

  it("takes you to a chronicle's own page when its card is clicked", () => {
    renderGrid("home")

    fireEvent.click(screen.getByText(CHRONICLES[0].title))

    expect(screen.getByText("Chronicle reader")).toBeInTheDocument()
  })

  it("takes you to the full hub when 'Explore all' is clicked", () => {
    renderGrid("home")

    fireEvent.click(screen.getByRole("button", { name: /Explore all Learning Chronicles/ }))

    expect(screen.getByText("Learning hub")).toBeInTheDocument()
  })

  it("shows every chronicle and no explore-all button on the full hub", () => {
    renderGrid("all")

    expect(screen.queryByRole("button", { name: /Explore all Learning Chronicles/ })).not.toBeInTheDocument()
    for (const chronicle of CHRONICLES) {
      expect(screen.getByText(chronicle.title)).toBeInTheDocument()
    }
  })
})
