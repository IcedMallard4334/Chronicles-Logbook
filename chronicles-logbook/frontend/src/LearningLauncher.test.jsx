import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { expect, it } from "vitest"

import LearningLauncher from "./LearningLauncher"

it("is a visible button that opens the Learning Chronicles hub", () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LearningLauncher />} />
        <Route path="/learning" element={<p>Learning hub</p>} />
      </Routes>
    </MemoryRouter>
  )

  fireEvent.click(screen.getByRole("button", { name: "Learning Chronicles" }))

  expect(screen.getByText("Learning hub")).toBeInTheDocument()
})
