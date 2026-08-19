import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AuthPage from "./AuthPage"
import { registerWithPassword, signInWithPassword } from "./api"

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    registerWithPassword: vi.fn(),
    signInWithPassword: vi.fn(),
  }
})

function renderPage(mode) {
  return render(
    <MemoryRouter initialEntries={[mode === "signup" ? "/signup" : "/"]}>
      <Routes>
        <Route path="/" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/app" element={<p>Logbook home</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("offers Google authentication when creating an account", () => {
    renderPage("signup")

    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "http://localhost:8000/auth/google/login"
    )
    expect(screen.getByLabelText("Full name")).toBeInTheDocument()
    expect(screen.getByLabelText("Email address")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument()
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

  it("creates a password account and stores the session", async () => {
    registerWithPassword.mockResolvedValue({
      access_token: "password-session-token",
      user: { full_name: "Ethan Student", email: "ethan@example.com" },
    })
    renderPage("signup")

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ethan Student" },
    })
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ethan@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Logbook home")).toBeInTheDocument()
    expect(registerWithPassword).toHaveBeenCalledWith({
      full_name: "Ethan Student",
      email: "ethan@example.com",
      password: "password123",
    })
    expect(window.localStorage.getItem("chronicles_token")).toBe("password-session-token")
  })

  it("rejects mismatched confirmation passwords", async () => {
    renderPage("signup")

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ethan Student" },
    })
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ethan@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password456" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.")
    expect(registerWithPassword).not.toHaveBeenCalled()
  })

  it("shows a password sign-in error", async () => {
    signInWithPassword.mockRejectedValue(new Error("Invalid email address or password."))
    renderPage("signin")

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ethan@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email address or password.")
    })
  })
})
