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

  const step = (summary, state = "pending", extra = {}) => ({ action: { type: "create_task", summary, destructive: false }, state, ...extra })
  const withBatch = (batch, overrides = {}) =>
    conversation({
      messages: [{ id: "m1", role: "assistant", content: "On it.", batchId: "b1" }],
      batches: [{ id: "b1", ...batch }],
      onRunBatch: vi.fn(),
      onCancelBatch: vi.fn(),
      ...overrides,
    })

  it("lists what Mira proposes under her reply and waits for confirmation when asked to", () => {
    const state = withBatch({ status: "awaiting", items: [step("Create project “Research notes” with 2 fields"), step("Add the task “Outline” to “Research notes”")] })
    render(<MiraAssistantPage conversation={state} />)

    const card = screen.getByRole("region", { name: "Proposed actions" })
    expect(within(card).getByText("Mira would like to do 2 things")).toBeInTheDocument()
    expect(within(card).getByText("Create project “Research notes” with 2 fields")).toBeInTheDocument()
    expect(within(card).getByText("Nothing has changed yet. Review this before confirming.")).toBeInTheDocument()
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }))
    expect(state.onCancelBatch).toHaveBeenCalledWith("b1")
    fireEvent.click(within(card).getByRole("button", { name: "Do all 2" }))
    expect(state.onRunBatch).toHaveBeenCalledWith("b1")
  })

  it("offers a single action as 'Do it'", () => {
    render(<MiraAssistantPage conversation={withBatch({ status: "awaiting", items: [step("Add a task")] })} />)

    expect(screen.getByText("Mira would like to")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Do it" })).toBeInTheDocument()
  })

  it("says plainly when an action can't be undone, and that Mira needs the OK", () => {
    const destructive = { action: { type: "delete_task", summary: "Delete a task", destructive: true }, state: "pending" }
    render(<MiraAssistantPage conversation={withBatch({ status: "awaiting", items: [destructive] })} />)

    expect(screen.getByText(/this can’t be undone/)).toBeInTheDocument()
    expect(screen.getByText("Mira needs your OK")).toBeInTheDocument()
  })

  it("shows each step as it runs: done steps say what was done, the one in progress is marked busy, the rest wait", () => {
    const state = withBatch({
      status: "running",
      items: [step("Create project “Garden”", "done", { detail: "Created project “Garden”" }), step("Add the task “Dig”", "running"), step("Add the task “Plant”")],
    })
    render(<MiraAssistantPage conversation={state} />)

    const card = screen.getByRole("region", { name: "Proposed actions" })
    expect(card).toHaveAttribute("aria-busy", "true")
    expect(within(card).getByText("Working on it…")).toBeInTheDocument()
    expect(within(card).getByText("Created project “Garden”")).toBeInTheDocument()
    expect(within(card).getByText("Done:")).toBeInTheDocument()
    expect(within(card).getByText("Working on it:")).toBeInTheDocument()
    expect(within(card).getByText("Waiting:")).toBeInTheDocument()
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
  })

  it("says which step didn't work and why, and which were not run", () => {
    const state = withBatch({
      status: "finished",
      failed: true,
      items: [
        step("Create project “Garden”", "done", { detail: "Created project “Garden”" }),
        step("Log an entry in “Garden”", "failed", { detail: "“Garden” needs Place before this entry can be logged." }),
        step("Add the task “Dig”", "skipped"),
      ],
    })
    render(<MiraAssistantPage conversation={state} />)

    const card = screen.getByRole("region", { name: "Proposed actions" })
    expect(within(card).getByText("Part of that didn’t work")).toBeInTheDocument()
    expect(within(card).getByText("“Garden” needs Place before this entry can be logged.")).toBeInTheDocument()
    expect(within(card).getByText("Didn't work:")).toBeInTheDocument()
    expect(within(card).getByText("Not run:")).toBeInTheDocument()
  })

  it("says everything is done when it is, and shows a cancelled batch as cancelled", () => {
    const { unmount } = render(<MiraAssistantPage conversation={withBatch({ status: "finished", items: [step("A", "done", { detail: "Did A" }), step("B", "done", { detail: "Did B" })] })} />)
    expect(screen.getByText("All done")).toBeInTheDocument()
    unmount()

    render(<MiraAssistantPage conversation={withBatch({ status: "cancelled", items: [step("A")] })} />)
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
  })

  it("keeps the steps under the reply that proposed them, and hides how Mira's actions went (that is for her)", () => {
    const state = conversation({
      messages: [
        { id: "u1", role: "user", content: "Make a garden" },
        { id: "m1", role: "assistant", content: "On it.", batchId: "b1" },
        { id: "t1", role: "tool", content: "- ✓ Created project “Garden”" },
        { id: "m2", role: "assistant", content: "All set." },
      ],
      batches: [{ id: "b1", status: "finished", items: [step("Create project “Garden”", "done", { detail: "Created project “Garden”" })] }],
    })
    render(<MiraAssistantPage conversation={state} />)

    const text = screen.getByLabelText("Mira conversation").textContent
    expect(text.indexOf("On it.")).toBeLessThan(text.indexOf("Created project “Garden”"))
    expect(text.indexOf("Created project “Garden”")).toBeLessThan(text.indexOf("All set."))
    expect(text).not.toContain("- ✓")
  })

  it("turns Send into Stop while Mira is replying", () => {
    const state = conversation({ sending: true, onStop: vi.fn() })
    render(<MiraAssistantPage conversation={state} />)

    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(state.onStop).toHaveBeenCalledTimes(1)
  })

  it("offers action-oriented starting points, and an opt-in to be asked before anything changes", () => {
    const state = conversation({ autoRun: true, onToggleAutoRun: vi.fn() })
    render(<MiraAssistantPage conversation={state} />)

    expect(screen.getByText("Set up a project")).toBeInTheDocument()
    expect(screen.getByText("Schedule something")).toBeInTheDocument()
    const toggle = screen.getByLabelText(/Ask me before Mira changes anything/)
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(state.onToggleAutoRun).toHaveBeenCalledWith(false)
  })
})

describe("collapsible suggestions", () => {
  it("can be folded away to leave room for the message box, and opened again", () => {
    render(<MiraAssistantPage conversation={conversation()} />)
    const toggle = screen.getByRole("button", { name: "Hide suggestions" })
    expect(screen.getByLabelText("Suggested prompts")).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.queryByLabelText("Suggested prompts")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show suggestions" })).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(screen.getByRole("button", { name: "Show suggestions" }))
    expect(screen.getByLabelText("Suggested prompts")).toBeInTheDocument()
  })

  it("starts folded on a phone", () => {
    const original = window.matchMedia
    window.matchMedia = () => ({ matches: true })
    try {
      render(<MiraAssistantPage conversation={conversation()} />)
      expect(screen.queryByLabelText("Suggested prompts")).not.toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})
