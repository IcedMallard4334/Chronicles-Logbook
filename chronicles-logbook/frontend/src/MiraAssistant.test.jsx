import { act, fireEvent, render, screen, within } from "@testing-library/react"
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
      expect(screen.getByLabelText("Message Mira").value).toBe("Plan my week")
      fireEvent.click(screen.getByRole("button", { name: "Stop dictating" }))
      // Stopping closes the last sentence.
      expect(screen.getByLabelText("Message Mira").value).toBe("Plan my week.")
      expect(screen.getByRole("button", { name: "Dictate your message" })).toBeInTheDocument()
    } finally {
      delete window.webkitSpeechRecognition
    }
  })

  it("puts the microphone before the hint text and the send button at the end", () => {
    window.webkitSpeechRecognition = class { start() {} stop() {} }
    try {
      const { container } = render(<MiraAssistantPage conversation={conversation()} />)
      const row = container.querySelector(".mira-composer-actions")
      const order = [...row.children].map((child) => child.className.split(" ")[0])
      expect(order).toEqual(["mira-mic", "mira-composer-hint", "btn-primary"])
    } finally {
      delete window.webkitSpeechRecognition
    }
  })

  it("hides the microphone where dictation is unsupported", () => {
    render(<MiraAssistantPage conversation={conversation()} />)
    expect(screen.queryByRole("button", { name: "Dictate your message" })).not.toBeInTheDocument()
  })

  it("renders Mira's markdown, showing its thinking while it streams", () => {
    const state = conversation({
      sending: true,
      messages: [
        { id: "u1", role: "user", content: "Hello" },
        { id: "m1", role: "assistant", content: "A **logbook** records work.", thinking: "Weighing what to explain.", streaming: true },
      ],
    })
    const { container } = render(<MiraAssistantPage conversation={state} />)
    expect(container.querySelector(".mira-message-assistant strong")).toHaveTextContent("logbook")
    expect(container).not.toHaveTextContent("**")
    expect(screen.getByText("Weighing what to explain.")).toBeInTheDocument()
    expect(container.querySelector(".mira-caret")).toBeInTheDocument()
  })

  it("lists earlier conversations and opens, starts and deletes them", () => {
    const state = conversation({
      conversations: [
        { id: "c1", title: "Planning my week", updated_at: "2026-09-29T10:00:00Z" },
        { id: "c2", title: "Research notes", updated_at: "2026-09-28T10:00:00Z" },
      ],
      activeConversationId: "c1",
      onSelectConversation: vi.fn(),
      onNewConversation: vi.fn(),
      onDeleteConversation: vi.fn(),
    })
    render(<MiraAssistantPage conversation={state} />)

    expect(screen.queryByText("Research notes")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /History/ }))
    fireEvent.click(screen.getByText("Research notes"))
    expect(state.onSelectConversation).toHaveBeenCalledWith("c2")

    fireEvent.click(screen.getByRole("button", { name: /History/ }))
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation: Planning my week" }))
    expect(state.onDeleteConversation).toHaveBeenCalledWith("c1")

    fireEvent.click(screen.getByRole("button", { name: "New chat" }))
    expect(state.onNewConversation).toHaveBeenCalled()
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
    fireEvent.click(screen.getByText("New conversation"))
    expect(state.onClear).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Close Mira" }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it("lists what Mira proposes and waits for confirmation", () => {
    const state = conversation({
      pendingActions: [
        { type: "create_project", summary: "Create project “Research notes” with 2 fields", destructive: false },
        { type: "create_task", summary: "Add the task “Outline” to “Research notes”", destructive: false },
      ],
      onRunActions: vi.fn(),
      onCancelActions: vi.fn(),
      actionsRunning: false,
    })
    render(<MiraAssistantPage conversation={state} />)

    const card = screen.getByRole("region", { name: "Proposed actions" })
    expect(within(card).getByText("Mira would like to do 2 things")).toBeInTheDocument()
    expect(within(card).getByText("Create project “Research notes” with 2 fields")).toBeInTheDocument()
    expect(within(card).getByText("Nothing has changed yet. Review this before confirming.")).toBeInTheDocument()
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }))
    expect(state.onCancelActions).toHaveBeenCalledTimes(1)
    fireEvent.click(within(card).getByRole("button", { name: "Do all 2" }))
    expect(state.onRunActions).toHaveBeenCalledTimes(1)
  })

  it("says plainly when an action can't be undone, and disables the buttons while working", () => {
    const state = conversation({
      pendingActions: [{ type: "delete_task", summary: "Delete a task", destructive: true }],
      onRunActions: vi.fn(),
      onCancelActions: vi.fn(),
      actionsRunning: true,
    })
    render(<MiraAssistantPage conversation={state} />)

    expect(screen.getByText(/this can’t be undone/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  })

  it("offers action-oriented starting points, and an opt-in to run simple changes straight away", () => {
    const state = conversation({ autoRun: false, onToggleAutoRun: vi.fn() })
    render(<MiraAssistantPage conversation={state} />)

    expect(screen.getByText("Set up a project")).toBeInTheDocument()
    expect(screen.getByText("Schedule something")).toBeInTheDocument()
    const toggle = screen.getByLabelText(/Run simple changes straight away/)
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(state.onToggleAutoRun).toHaveBeenCalledWith(true)
  })
})
