// Browser speech features. Both run on the device (or the browser vendor's own
// speech service); nothing is sent to Chronicles' servers.

const READER_KEY = "chronicles-page-reader"
export const READER_EVENT = "chronicles-page-reader-change"

export function dictationSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function readAloudSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function"
}

export function pageReaderEnabled() {
  try {
    return window.localStorage.getItem(READER_KEY) === "on"
  } catch {
    return false
  }
}

export function setPageReaderEnabled(enabled) {
  try {
    window.localStorage.setItem(READER_KEY, enabled ? "on" : "off")
  } catch {
    // Storage blocked: the preference just won't persist past this page.
  }
  window.dispatchEvent(new CustomEvent(READER_EVENT, { detail: enabled }))
}

const DICTATION_ERRORS = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser's site settings to dictate.",
  "service-not-allowed": "Microphone access was blocked. Allow it in your browser's site settings to dictate.",
  "no-speech": "I didn't hear anything. Try again a little closer to the microphone.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs an internet connection in this browser.",
}

/**
 * Starts dictation. `onFinal(text)` receives each finished phrase,
 * `onInterim(text)` the phrase still being recognised. Returns { stop }.
 */
export function startDictation({ onFinal, onInterim, onEnd, onError, lang }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new Recognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = lang || navigator.language || "en-US"

  recognition.onresult = (event) => {
    let interim = ""
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const text = result[0]?.transcript || ""
      if (result.isFinal) onFinal?.(text.trim())
      else interim += text
    }
    onInterim?.(interim)
  }
  recognition.onerror = (event) => {
    onError?.(DICTATION_ERRORS[event.error] || "Dictation stopped unexpectedly.")
  }
  recognition.onend = () => {
    onInterim?.("")
    onEnd?.()
  }
  recognition.start()
  return { stop: () => recognition.stop() }
}

// Chrome silently drops utterances longer than ~15 s, so long text is spoken
// as sentence-sized pieces queued one after another.
export function splitForSpeech(text, maxLength = 220) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?\n]+[.!?]*\s*/g) || []
  const chunks = []
  let current = ""
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim())
      current = ""
    }
    current += sentence
    while (current.length > maxLength * 1.5) {
      const cut = current.lastIndexOf(" ", maxLength) > 0 ? current.lastIndexOf(" ", maxLength) : maxLength
      chunks.push(current.slice(0, cut).trim())
      current = current.slice(cut)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

export function speak(text, { onEnd, onError } = {}) {
  const chunks = splitForSpeech(text)
  const synth = window.speechSynthesis
  synth.cancel()
  let cancelled = false
  chunks.forEach((chunk, index) => {
    const utterance = new window.SpeechSynthesisUtterance(chunk)
    utterance.lang = navigator.language || "en-US"
    if (index === chunks.length - 1) utterance.onend = () => { if (!cancelled) onEnd?.() }
    utterance.onerror = (event) => {
      if (cancelled || event.error === "canceled" || event.error === "interrupted") return
      onError?.()
    }
    synth.speak(utterance)
  })
  if (!chunks.length) onEnd?.()
  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    stop: () => { cancelled = true; synth.cancel() },
  }
}
