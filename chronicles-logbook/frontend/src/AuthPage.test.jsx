import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AuthPage from "./AuthPage"
import { signIn, signUp } from "./api"

vi.mock("./api", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

function renderPage(mode) {
  return render(
    <MemoryRouter>
      <AuthPage mode={mode} />
    </MemoryRouter>
  )
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("submits the sign-up form and stores the session", async () => {
    signUp.mockResolvedValue({
      access_token: "signed-token",
      user: { id: "user-1", full_name: "Ethan Student", email: "ethan@example.com" },
    })
    renderPage("signup")

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ethan Student" } })
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ETHAN@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password1" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      full_name: "Ethan Student",
      email: "ethan@example.com",
      password: "password1",
    }))
    expect(await screen.findByRole("status")).toHaveTextContent("Account created")
    expect(window.localStorage.getItem("chronicles_token")).toBe("signed-token")
  })

  it("validates matching passwords before calling the API", () => {
    renderPage("signup")
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ethan" } })
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ethan@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password2" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match")
    expect(signUp).not.toHaveBeenCalled()
  })

  it("shows the backend error when sign-in fails", async () => {
    signIn.mockRejectedValue(new Error("Incorrect email or password."))
    renderPage("signin")
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ethan@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-pass" } })
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password")
  })
})
