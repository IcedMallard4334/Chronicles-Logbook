import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
      </Routes>
    </MemoryRouter>
  )
}

describe("AuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stores the Google-authenticated session and opens the app", async () => {
    window.history.pushState({}, "", "/auth/callback#token=google-session-token")
    fetchCurrentUser.mockResolvedValue({
      id: "user-1",
      full_name: "Ethan Student",
      email: "ethan@example.com",
    })

    renderCallback()

    expect(await screen.findByText("Logbook home")).toBeInTheDocument()
    expect(window.localStorage.getItem("chronicles_token")).toBe("google-session-token")
    expect(JSON.parse(window.localStorage.getItem("chronicles_user"))).toEqual(
      expect.objectContaining({ email: "ethan@example.com" })
    )
  })

  it("shows the provider error", async () => {
    window.history.pushState({}, "", "/auth/callback#error=Google%20authentication%20failed")

    renderCallback()

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Google authentication failed")
    })
  })
})
