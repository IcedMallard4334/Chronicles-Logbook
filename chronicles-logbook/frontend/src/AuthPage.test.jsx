import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthPage from "./AuthPage"
import { devLogin, getGoogleLoginUrl } from "./api"

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    getGoogleLoginUrl: vi.fn(),
    devLogin: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/app" element={<p>Logbook home</p>} />
        <Route path="/setup" element={<p>Workspace setup</p>} />
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

  it("offers a create-account link that starts the same Google flow", () => {
    // Google sign-in creates an account on first use (see auth.py's
    // google_callback), so "sign up" and "sign in" are the same request —
    // this link exists only to reassure someone who isn't sure they've
    // signed up yet, not to start a different flow.
    renderPage()

    const createAccountLink = screen.getByRole("link", { name: "Create one" })
    expect(createAccountLink).toHaveAttribute(
      "href",
      "http://localhost:8000/auth/google/login"
    )
    expect(screen.getByText("Don’t have an account?")).toBeInTheDocument()
  })
})

describe("AuthPage — local dev login (US local-dev fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    getGoogleLoginUrl.mockReturnValue("http://localhost:8000/auth/google/login")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("offers a 'Continue without Google' option while running the dev server", () => {
    renderPage()

    expect(screen.getByRole("button", { name: "Continue without Google" })).toBeInTheDocument()
  })

  it("is absent from a production build, not just visually hidden", () => {
    // import.meta.env.DEV is what AuthPage checks before rendering the
    // panel at all — stubbing it to false is what a real production build
    // sees, so this is the guarantee that the bypass can never ship live,
    // not just that nobody happens to click it.
    vi.stubEnv("DEV", false)

    renderPage()

    expect(screen.queryByRole("button", { name: "Continue without Google" })).not.toBeInTheDocument()
    expect(screen.queryByText("Local development")).not.toBeInTheDocument()
  })

  it("signs in and goes straight to the workspace for a returning dev account", async () => {
    window.localStorage.setItem("chronicles-setup-complete-dev-1", "true")
    devLogin.mockResolvedValue({ user: { id: "dev-1", full_name: "Dev User" } })
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    await waitFor(() => expect(screen.getByText("Logbook home")).toBeInTheDocument())
    expect(devLogin).toHaveBeenCalledWith("", "")
  })

  it("routes a brand-new dev account through workspace setup first", async () => {
    devLogin.mockResolvedValue({ user: { id: "dev-2", full_name: "Dev User" } })
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    await waitFor(() => expect(screen.getByText("Workspace setup")).toBeInTheDocument())
  })

  it("sends whatever email and name were typed in", async () => {
    devLogin.mockResolvedValue({ user: { id: "dev-3", full_name: "Reviewer" } })
    renderPage()

    fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "reviewer@example.com" } })
    fireEvent.change(screen.getByLabelText("Name (optional)"), { target: { value: "Reviewer" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    await waitFor(() => expect(devLogin).toHaveBeenCalledWith("reviewer@example.com", "Reviewer"))
  })

  it("shows a plain explanation when the backend hasn't enabled dev login", async () => {
    const notEnabled = new Error("Not found.")
    notEnabled.status = 404
    devLogin.mockRejectedValue(notEnabled)
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("ENABLE_DEV_LOGIN=true")
    // Failing must not strand the button in a disabled "signing in" state.
    expect(screen.getByRole("button", { name: "Continue without Google" })).toBeEnabled()
  })
})
