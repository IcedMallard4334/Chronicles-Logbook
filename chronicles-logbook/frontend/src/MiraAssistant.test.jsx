import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"

function conversation(overrides = {}) {
  return { messages: [], sending: false, error: null, onSend: vi.fn().mockResolvedValue(undefined), onClear: vi.fn(), ...overrides }
}

describe("Mira assistant interfaces", () => {
  it("lets users edit a suggested prompt before sending", () => {
    const state = conversation()
    render(<MiraAssistantPage conversation={state} />)
    expect(screen.getByText("Make room for your next idea.")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Write a clearer update"))
    expect(state.onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Message Mira")).toHaveFocus()
    expect(screen.getByLabelText("Message Mira").value).toContain("Help me write a clear project update")
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: "Help me capture today's research" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(state.onSend).toHaveBeenCalledWith("Help me capture today's research")
  })

  it("dictates into the message box when the browser supports speech recognition", () => {
    let instance
    window.webkitSpeechRecognition = class {
      constructor() { instance = this }
      start() {}
      stop() { this.onend?.() }
    }
    try {
      render(<MiraAssistantPage conversation={conversation()} />)
      fireEvent.click(screen.getByRole("button", { name: "Dictate your message" }))
      expect(screen.getByRole("button", { name: "Stop dictating" })).toHaveAttribute("aria-pressed", "true")
      act(() => {
        instance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "plan my week" }], { isFinal: true })] })
      })
      expect(screen.getByLabelText("Message Mira").value).toBe("plan my week")
      fireEvent.click(screen.getByRole("button", { name: "Stop dictating" }))
      expect(screen.getByRole("button", { name: "Dictate your message" })).toBeInTheDocument()
    } finally {
      delete window.webkitSpeechRecognition
    }
  })

  it("hides the microphone where dictation is unsupported", () => {
    render(<MiraAssistantPage conversation={conversation()} />)
    expect(screen.queryByRole("button", { name: "Dictate your message" })).not.toBeInTheDocument()
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
