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
    fetchAchievements: vi.fn(() => Promise.resolve({ badges: [], earned: 0, total: 0, by_tier: { bronze: { earned: 0, total: 0 }, silver: { earned: 0, total: 0 }, gold: { earned: 0, total: 0 }, legendary: { earned: 0, total: 0 } }, by_category: {} })),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/app" element={<p>Workspace</p>} />
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

  it("has a way back to the workspace that keeps its icon on a phone", async () => {
    renderPage()
    await screen.findByRole("heading", { name: "Ethan Student" })

    const back = screen.getByRole("button", { name: "Back to workspace" })
    // The nav hides every <span> inside a nav-item below 520px. The icon is
    // therefore an SVG, so the control cannot be emptied by that rule.
    expect(back.querySelector("svg")).not.toBeNull()

    fireEvent.click(back)

    expect(await screen.findByText("Workspace")).toBeInTheDocument()
  })

  it("lets people replace the preset with one colour of their own, then reset it", async () => {
    renderPage()
    await screen.findByText("Ethan Student")
    const root = document.documentElement

    fireEvent.change(screen.getByLabelText("Custom accent colour"), { target: { value: "#ff5500" } })

    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--mauve")).not.toBe("")
    expect(root.dataset.customGlow).toBe("on")
    expect(window.localStorage.getItem("chronicles-custom-accent")).toBe("#ff5500")

    fireEvent.click(screen.getByRole("button", { name: "Reset colours" }))

    expect(root.style.getPropertyValue("--blue")).toBe("")
    expect(root.dataset.customGlow).toBeUndefined()
    expect(window.localStorage.getItem("chronicles-custom-accent")).toBeNull()
    expect(screen.getByRole("button", { name: "Reset colours" })).toBeDisabled()
  })

  it("offers the pieces separately under Advanced, including the page background", async () => {
    renderPage()
    await screen.findByText("Ethan Student")
    expect(screen.queryByLabelText("Page glow")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    fireEvent.change(screen.getByLabelText("Buttons and highlights"), { target: { value: "#ff5500" } })
    fireEvent.change(screen.getByLabelText("Second colour"), { target: { value: "#00aaff" } })
    fireEvent.change(screen.getByLabelText("Page glow"), { target: { value: "#22cc88" } })
    fireEvent.change(screen.getByLabelText("Page background"), { target: { value: "#101820" } })

    const root = document.documentElement
    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--mauve")).toBe("#00aaff")
    expect(root.style.getPropertyValue("--glow-1")).toBe("#22cc88")
    expect(root.style.getPropertyValue("--bg")).toBe("#101820")

    fireEvent.click(screen.getByRole("button", { name: "Reset colours" }))
    expect(root.style.getPropertyValue("--bg")).toBe("")
  })

  it("opens on Advanced when a piece is already in use", async () => {
    window.localStorage.setItem("chronicles-custom-glow", "#22cc88")
    renderPage()
    await screen.findByText("Ethan Student")

    expect(screen.getByLabelText("Page glow")).toHaveValue("#22cc88")
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-pressed", "true")
  })

  it("choosing a preset accent replaces a custom one but keeps a custom page background", async () => {
    window.localStorage.setItem("chronicles-custom-accent", "#ff5500")
    window.localStorage.setItem("chronicles-custom-background", "#101820")
    renderPage()
    await screen.findByText("Ethan Student")

    fireEvent.change(screen.getByRole("combobox", { name: "Accent colour" }), { target: { value: "rose" } })

    expect(window.localStorage.getItem("chronicles-custom-accent")).toBeNull()
    expect(window.localStorage.getItem("chronicles-custom-background")).toBe("#101820")
    expect(document.documentElement.style.getPropertyValue("--blue")).toBe("")
  })

  it("lists the accent colour straight after workspace density, before your own colours", async () => {
    renderPage()
    await screen.findByText("Ethan Student")

    const labels = [...document.querySelectorAll(".profile-row-label")].map((node) => node.textContent)
    const density = labels.indexOf("Workspace density")
    expect(labels[density + 1]).toBe("Accent colour")
    expect(labels[density + 2]).toBe("Your own colours")
    expect(labels).not.toContain("Workspace settings")
    expect(screen.getByRole("heading", { name: "Workspace settings" })).toBeInTheDocument()
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
