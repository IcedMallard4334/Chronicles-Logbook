import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AuthPage from "./AuthPage"
import { getGoogleLoginUrl } from "./api"

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    getGoogleLoginUrl: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/app" element={<p>Logbook home</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGoogleLoginUrl.mockReturnValue("http://localhost:8000/auth/google/login")
  })

  it("renders the sign-in panel with Google as the only provider", () => {
    renderPage()

    expect(screen.getByRole("heading", { name: "Sign in to Chronicles" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "http://localhost:8000/auth/google/login"
    )
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument()
  })

  it("explains that Google is the only sign-in option", () => {
    renderPage()

    expect(
      screen.getByText("Continue with your Google account to access your projects and entries.")
    ).toBeInTheDocument()
  })
})
