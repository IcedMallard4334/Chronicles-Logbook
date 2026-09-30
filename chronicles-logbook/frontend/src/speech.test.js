import { afterEach, describe, expect, it, vi } from "vitest"

import { dictationSupported, pageReaderEnabled, READER_EVENT, setPageReaderEnabled, splitForSpeech, startDictation } from "./speech"

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  window.localStorage.clear()
})

describe("splitForSpeech", () => {
  it("keeps short text as one piece", () => {
    expect(splitForSpeech("Hello there. How are you?")).toEqual(["Hello there. How are you?"])
  })

  it("splits long text at sentence boundaries under the limit", () => {
    const sentence = "This is a sentence of moderate length that goes on a bit. "
    const chunks = splitForSpeech(sentence.repeat(20))
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(330))
  })

  it("breaks a single run-on sentence with no punctuation", () => {
    const chunks = splitForSpeech("word ".repeat(200))
    expect(chunks.length).toBeGreaterThan(1)
  })

  it("returns nothing for blank text", () => {
    expect(splitForSpeech("   ")).toEqual([])
  })
})

describe("page reader preference", () => {
  it("defaults off, persists, and announces changes", () => {
    const listener = vi.fn()
    window.addEventListener(READER_EVENT, listener)
    expect(pageReaderEnabled()).toBe(false)
    setPageReaderEnabled(true)
    expect(pageReaderEnabled()).toBe(true)
    expect(listener).toHaveBeenCalled()
    window.removeEventListener(READER_EVENT, listener)
  })
})

describe("dictation", () => {
  it("reports unsupported browsers", () => {
    expect(dictationSupported()).toBe(false)
  })

  it("passes final and interim phrases through and reports friendly errors", () => {
    let instance
    window.SpeechRecognition = class {
      constructor() { instance = this }
      start() {}
      stop() { this.onend() }
    }
    const onFinal = vi.fn()
    const onInterim = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()
    const session = startDictation({ onFinal, onInterim, onError, onEnd })

    instance.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: " hello world " }], { isFinal: true }), Object.assign([{ transcript: "and more" }], { isFinal: false })],
    })
    expect(onFinal).toHaveBeenCalledWith("hello world")
    expect(onInterim).toHaveBeenCalledWith("and more")

    instance.onerror({ error: "not-allowed" })
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Microphone access was blocked"))

    session.stop()
    expect(onEnd).toHaveBeenCalled()
  })
})
