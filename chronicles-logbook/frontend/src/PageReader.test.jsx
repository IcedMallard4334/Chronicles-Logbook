import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PageReader from "./PageReader"
import { setPageReaderEnabled } from "./speech"

const spoken = []

beforeEach(() => {
  spoken.length = 0
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  window.speechSynthesis = {
    speak: vi.fn((utterance) => spoken.push(utterance.text)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }
})

afterEach(() => {
  delete window.SpeechSynthesisUtterance
  delete window.speechSynthesis
  window.localStorage.clear()
})

describe("PageReader", () => {
  it("renders nothing until it is enabled in the profile", () => {
    render(<PageReader />)
    expect(screen.queryByRole("button", { name: /read this page/i })).not.toBeInTheDocument()
  })

  it("reads the page, then pauses, resumes and stops", () => {
    window.localStorage.setItem("chronicles-page-reader", "on")
    render(<main>Your logbook is ready.</main>)
    render(<PageReader />)

    fireEvent.click(screen.getByRole("button", { name: /read this page/i }))
    expect(spoken.join(" ")).toContain("Your logbook is ready.")

    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(window.speechSynthesis.pause).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Resume" }))
    expect(window.speechSynthesis.resume).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(screen.getByRole("button", { name: /read this page/i })).toBeInTheDocument()
  })

  it("appears and disappears as the preference changes", () => {
    render(<PageReader />)
    act(() => setPageReaderEnabled(true))
    expect(screen.getByRole("button", { name: /read this page/i })).toBeInTheDocument()
    act(() => setPageReaderEnabled(false))
    expect(screen.queryByRole("button", { name: /read this page/i })).not.toBeInTheDocument()
  })
})
