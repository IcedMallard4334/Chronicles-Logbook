import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ProfilePage from "./ProfilePage"
import { deleteAccount, fetchCurrentUser } from "./api"

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    fetchCurrentUser: vi.fn(),
    deleteAccount: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<p>Landing page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

const mockUser = {
  id: "user-1",
  full_name: "Ethan Student",
  email: "ethan@example.com",
  avatar_url: null,
  created_at: "2026-08-12T08:00:00Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.setItem("chronicles_token", "session-token")
  fetchCurrentUser.mockResolvedValue(mockUser)

  delete window.location
  window.location = { href: "", assign: vi.fn() }
})

describe("ProfilePage", () => {
  it("loads and displays the current user", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ethan Student" })).toBeInTheDocument()
    })
    expect(screen.getByText("ethan@example.com")).toBeInTheDocument()
    expect(fetchCurrentUser).toHaveBeenCalled()
  })

  it("cycles through light, dark, and system themes", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ethan Student" })).toBeInTheDocument()
    })

    expect(screen.getByText("System")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }))
    expect(screen.getByText("Light")).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe("light")

    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }))
    expect(screen.getByText("Dark")).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe("dark")

    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }))
    expect(screen.getByText("System")).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it("signs out and clears the session", async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ethan Student" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() => {
      expect(window.localStorage.getItem("chronicles_token")).toBeNull()
      expect(window.localStorage.getItem("chronicles_user")).toBeNull()
    })
    // waitFor allows 1s by default, which the full suite under --coverage can
    // exceed on the redirect that follows — the assertion was sound and the
    // budget was not, so CI failed at random rather than on a defect.
    await waitFor(
      () => expect(window.location.assign).toHaveBeenCalledWith("/"),
      { timeout: 4000 }
    )
  })

  it("deletes the account after typing DELETE", async () => {
    deleteAccount.mockResolvedValue(null)
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ethan Student" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }))

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole("button", { name: "Delete my account" })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "DELETE" } })

    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled()
    })

    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalled()
      expect(window.localStorage.getItem("chronicles_token")).toBeNull()
    })
    // waitFor allows 1s by default, which the full suite under --coverage can
    // exceed on the redirect that follows — the assertion was sound and the
    // budget was not, so CI failed at random rather than on a defect.
    await waitFor(
      () => expect(window.location.assign).toHaveBeenCalledWith("/"),
      { timeout: 4000 }
    )
  })

  it("shows an error if deleting the account fails", async () => {
    deleteAccount.mockRejectedValue(new Error("Server error"))
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ethan Student" })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }))

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Delete your account?" })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "DELETE" } })

    const confirmButton = await screen.findByRole("button", { name: "Delete my account" })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Server error")
    })
  })
})
