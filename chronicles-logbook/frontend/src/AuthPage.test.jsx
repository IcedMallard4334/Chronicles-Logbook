import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import AuthPage from "./AuthPage"

function renderPage(mode) {
  return render(
    <MemoryRouter>
      <AuthPage mode={mode} />
    </MemoryRouter>
  )
}

describe("AuthPage", () => {
  it("offers Google authentication when creating an account", () => {
    renderPage("signup")

    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "http://localhost:8000/auth/google/login"
    )
    expect(screen.getByText(/never receives or stores your Google password/i)).toBeInTheDocument()
  })

  it("offers the same established provider when signing in", () => {
    renderPage("signin")

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup"
    )
  })
})
