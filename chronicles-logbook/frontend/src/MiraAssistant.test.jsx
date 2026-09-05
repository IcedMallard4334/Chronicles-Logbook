import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"

function conversation(overrides = {}) {
  return { messages: [], sending: false, error: null, onSend: vi.fn().mockResolvedValue(undefined), onClear: vi.fn(), ...overrides }
}

describe("Mira assistant interfaces", () => {
  it("shows the welcome state and sends a suggested prompt", () => {
    const state = conversation()
    render(<MiraAssistantPage conversation={state} />)
    expect(screen.getByText("Meet Mira")).toBeInTheDocument()
    fireEvent.click(screen.getByText("How can I keep a better project log?"))
    expect(state.onSend).toHaveBeenCalledWith("How can I keep a better project log?")
  })

  it("renders replies, loading state, errors, and retry", () => {
    const state = conversation({ messages: [{ id: "u1", role: "user", content: "Hello" }, { id: "m1", role: "assistant", content: "Hi, I’m Mira." }], sending: true, error: { message: "Mira could not reply just now.", retryMessage: "Hello again" } })
    render(<MiraAssistantPage conversation={state} />)
    expect(screen.getByText("Hi, I’m Mira.")).toBeInTheDocument()
    expect(screen.getByText(/Mira is thinking/)).toBeInTheDocument()
    fireEvent.click(screen.getByText("Retry"))
    expect(state.onSend).toHaveBeenCalledWith("Hello again")
  })

  it("blocks blank messages and supports Enter and Shift+Enter", () => {
    const state = conversation()
    render(<MiraAssistantPage conversation={state} />)
    const input = screen.getByLabelText("Message Mira")
    const send = screen.getByRole("button", { name: "Send" })
    expect(send).toBeDisabled()
    fireEvent.change(input, { target: { value: "Plan my day" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(state.onSend).toHaveBeenCalledWith("Plan my day")
    fireEvent.change(input, { target: { value: "First" } })
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
    expect(state.onSend).toHaveBeenCalledTimes(1)
  })

  it("opens, closes, opens the full page, and clears the same conversation", () => {
    const state = conversation({ messages: [{ id: "m1", role: "assistant", content: "Shared message" }] })
    const onToggle = vi.fn()
    const onOpenFull = vi.fn()
    const { rerender } = render(<MiraLauncher conversation={state} open={false} onToggle={onToggle} onOpenFull={onOpenFull} />)
    fireEvent.click(screen.getByRole("button", { name: "Open Mira assistant" }))
    expect(onToggle).toHaveBeenCalled()
    rerender(<MiraLauncher conversation={state} open onToggle={onToggle} onOpenFull={onOpenFull} />)
    expect(screen.getByText("Shared message")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Open full assistant"))
    expect(onOpenFull).toHaveBeenCalled()
    fireEvent.click(screen.getByText("Clear conversation"))
    expect(state.onClear).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Close Mira" }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it("shows a project proposal and waits for confirmation", () => {
    const state = conversation({
      pendingAction: { type: "create_project", payload: { name: "Research notes", description: "Weekly findings" }, requires_confirmation: true },
      onConfirmAction: vi.fn(),
      onCancelAction: vi.fn(),
      onOpenProject: vi.fn(),
      actionSaving: false,
    })
    render(<MiraAssistantPage conversation={state} />)
    expect(screen.getByRole("region", { name: "Proposed project" })).toBeInTheDocument()
    expect(screen.getByText("Mira has not created anything yet. Review this project before confirming.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(state.onCancelAction).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Create project" }))
    expect(state.onConfirmAction).toHaveBeenCalledTimes(1)
  })
})
