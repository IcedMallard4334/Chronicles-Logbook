import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthPage from "./AuthPage"
import { devLogin, fetchCurrentUser, getGoogleLoginUrl } from "./api"

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    getGoogleLoginUrl: vi.fn(),
    devLogin: vi.fn(),
    fetchCurrentUser: vi.fn(),
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
    window.localStorage.clear()
    getGoogleLoginUrl.mockReturnValue("http://localhost:8000/auth/google/login")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

  it("explains what the app is for behind a Get started button", () => {
    renderPage()

    const toggle = screen.getByRole("button", { name: "New here? Get started" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Create a project")).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Create a project")).toBeInTheDocument()
    expect(screen.getByText("Log entries as you go")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /start your first project/i })).toHaveAttribute(
      "href",
      "http://localhost:8000/auth/google/login"
    )
  })

  it("hides the without-Google option outside local runs", () => {
    // Stubbed rather than left to the ambient .env, so the test says the same
    // thing on a developer machine (which may set VITE_ENABLE_DEV_LOGIN) as in
    // CI (which never does).
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "")
    renderPage()

    expect(screen.queryByRole("button", { name: "Continue without Google" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Sign in as")).not.toBeInTheDocument()
  })

  it("signs in without Google when the local option is on", async () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true")
    devLogin.mockResolvedValue({ access_token: "local-dev-token" })
    fetchCurrentUser.mockResolvedValue({
      id: "user-1",
      full_name: "Dev Tester",
      email: "qa@chronicles.local",
    })

    renderPage()

    fireEvent.change(screen.getByLabelText("Sign in as"), {
      target: { value: "qa@chronicles.local" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    expect(await screen.findByText("Workspace setup")).toBeInTheDocument()
    expect(devLogin).toHaveBeenCalledWith("qa@chronicles.local")
    expect(window.localStorage.getItem("chronicles_token")).toBe("local-dev-token")
    expect(JSON.parse(window.localStorage.getItem("chronicles_user"))).toEqual(
      expect.objectContaining({ email: "qa@chronicles.local" })
    )
  })

  it("shows the backend's refusal inline rather than navigating", async () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true")
    devLogin.mockRejectedValue(new Error("Not found."))

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Continue without Google" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Not found.")
    expect(window.localStorage.getItem("chronicles_token")).toBeNull()
    // The button comes back once the refusal is shown.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue without Google" })).not.toBeDisabled()
    )
  })
})
