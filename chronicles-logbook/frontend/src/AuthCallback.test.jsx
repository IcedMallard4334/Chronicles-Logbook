import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthCallback from "./AuthCallback"
import { fetchCurrentUser } from "./api"

vi.mock("./api", () => ({
  fetchCurrentUser: vi.fn(),
}))

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={["/auth/callback"]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app" element={<p>Logbook home</p>} />
        <Route path="/setup" element={<p>Setup workspace</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("takes a first-time user to setup after a successful sign-in", async () => {
    window.history.pushState({}, "", "/auth/callback#token=google-session-token")
    fetchCurrentUser.mockResolvedValue({
      id: "user-1",
      full_name: "Ethan Student",
      email: "ethan@example.com",
    })

    renderCallback()

    // Wait for the success state to appear.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Sign-in successful" })).toBeInTheDocument()
    })

    expect(screen.getByText("Welcome, Ethan Student! Let’s set up your workspace.")).toBeInTheDocument()
    expect(window.localStorage.getItem("chronicles_token")).toBe("google-session-token")
    expect(JSON.parse(window.localStorage.getItem("chronicles_user"))).toEqual(
      expect.objectContaining({ email: "ethan@example.com" })
    )

    // Advance past the delay to trigger navigation.
    await vi.advanceTimersByTimeAsync(1500)

    expect(await screen.findByText("Setup workspace")).toBeInTheDocument()
  })

  it("takes a user who completed setup to the app", async () => {
    window.history.pushState({}, "", "/auth/callback#token=returning-session-token")
    window.localStorage.setItem("chronicles-setup-complete-user-1", "true")
    fetchCurrentUser.mockResolvedValue({ id: "user-1", full_name: "Ethan Student", email: "ethan@example.com" })

    renderCallback()

    await waitFor(() => expect(screen.getByText("Welcome back, Ethan Student!")).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(1500)
    expect(await screen.findByText("Logbook home")).toBeInTheDocument()
  })

  it("shows the provider error", async () => {
    window.history.pushState({}, "", "/auth/callback#error=Google%20authentication%20failed")

    renderCallback()

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Google authentication failed")
    })
  })
})
