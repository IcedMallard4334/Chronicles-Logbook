import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import SetupPage from "./SetupPage"

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={["/setup"]}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/mira-permissions" element={<p>Mira permissions</p>} />
      </Routes>
    </MemoryRouter>
  )
}

it("uses the recommended Chronicles palette by default", () => {
  window.localStorage.clear()
  renderSetup()
  expect(screen.getByRole("radio", { name: /Chronicles Recommended/ })).toHaveAttribute("aria-checked", "true")
})

it("saves chosen setup preferences before opening the workspace", () => {
  window.localStorage.clear()
  renderSetup()
  fireEvent.click(screen.getByRole("radio", { name: /Ocean/ }))
  fireEvent.click(screen.getByRole("radio", { name: /Light/ }))
  fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }))
  expect(window.localStorage.getItem("chronicles-accent")).toBe("ocean")
  expect(window.localStorage.getItem("chronicles-theme")).toBe("light")
  expect(screen.getByText("Mira permissions")).toBeInTheDocument()
})
