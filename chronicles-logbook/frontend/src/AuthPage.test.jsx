import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import AuthPage from "./AuthPage"

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>
  )
}

describe("AuthPage", () => {
  it("renders the sign-in heading", () => {
    renderPage()

    expect(screen.getByRole("heading", { name: "Sign in to Chronicles" })).toBeInTheDocument()
  })

  it("offers Google authentication with the correct login URL", () => {
    renderPage()

    const googleLink = screen.getByRole("link", { name: "Continue with Google" })
    expect(googleLink).toHaveAttribute("href", "http://localhost:8000/auth/google/login")
  })

  it("displays the subtitle and provider note", () => {
    renderPage()

    expect(
      screen.getByText("Continue with your Google account to access your logbook.")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Google will ask you to choose an account each time.")
    ).toBeInTheDocument()
  })
})
