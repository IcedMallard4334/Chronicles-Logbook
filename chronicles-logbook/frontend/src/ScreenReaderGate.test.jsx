import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ScreenReaderGate from "./ScreenReaderGate"
import { setScreenReaderEnabled } from "./speech"

beforeEach(() => {
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() }
})

afterEach(() => {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
  window.localStorage.clear()
})

describe("ScreenReaderGate", () => {
  it("loads nothing while the screen reader is off", () => {
    const { container } = render(<ScreenReaderGate />)
    expect(container).toBeEmptyDOMElement()
  })

  it("brings the reader in when it is switched on, and takes it away when it is switched off", async () => {
    render(<ScreenReaderGate />)

    act(() => setScreenReaderEnabled(true))
    expect(await screen.findByRole("group", { name: "Screen reader" })).toBeInTheDocument()

    act(() => setScreenReaderEnabled(false))
    expect(screen.queryByRole("group", { name: "Screen reader" })).not.toBeInTheDocument()
  })

  it("starts straight away for someone who already has it on", async () => {
    window.localStorage.setItem("chronicles-screen-reader", "on")
    render(<ScreenReaderGate />)
    expect(await screen.findByRole("group", { name: "Screen reader" })).toBeInTheDocument()
  })
})
