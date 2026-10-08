// Voice dictation for Mira's message box. It runs on the device (or the browser
// vendor's own speech service); nothing is sent to Chronicles' servers.

export function dictationSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// ── Dictation ────────────────────────────────────────────────────────
//
// The browser turns speech into words but not into writing: it doesn't know
// that "Mira" is a name, it never adds a comma, and it can't hear a full stop.
// This layer supplies what a person would: it prefers the word it was told to
// expect, understands spoken punctuation, and punctuates from the pauses.

/** Words the recogniser should prefer when it is unsure what it heard. */
export const DICTATION_VOCABULARY = ["Mira", "Chronicles"]

// Sounds that are never the word they are heard as; always meant as the name.
const MIRA_SOUNDALIKES = /\b(?:mirah|meera|myra|mirra|murah|mirrah|mira)(?=\b|['’])/gi
// "Mirror" is also a real word, so it is only read as the name where someone is
// plainly speaking to the assistant: greeting her, or starting a request.
const ADDRESSING_WORDS = "hey|hi|hello|ok|okay|thanks|thank you|ask|tell|dear|cheers"
const REQUEST_STARTERS =
  "can|could|would|will|please|what|how|why|when|where|who|create|add|set|schedule|help|show|open|make|log|write|plan|thanks|thank|are|do|does|is|i|let|lets|remind|start|find|tell|give|turn|switch|share|delete|rename|remove|archive|mark|complete|finish|change|update|stop|list|explain|summarise|summarize"

export function applyVocabulary(text) {
  return text
    .replace(MIRA_SOUNDALIKES, "Mira")
    .replace(new RegExp(`\\b(${ADDRESSING_WORDS})(,?\\s+)mirror\\b`, "gi"), "$1$2Mira")
    .replace(new RegExp(`^(\\s*)mirror(?=\\s*,|\\s+(?:${REQUEST_STARTERS})\\b)`, "i"), "$1Mira")
    .replace(/\bchronicles\b/gi, "Chronicles")
    .replace(/\bi\b/g, "I")
    .replace(/\bi(?=['’](?:m|ll|ve|d)\b)/g, "I")
}

/** Spoken punctuation ("comma", "full stop", "new line"...) becomes the punctuation. */
export function applySpokenPunctuation(text) {
  return text
    .replace(/\s*\bnew paragraph\b\s*/gi, "\n\n")
    .replace(/\s*\bnew ?line\b\s*/gi, "\n")
    .replace(/\s*\bquestion mark\b\s*/gi, "? ")
    .replace(/\s*\bexclamation (?:mark|point)\b\s*/gi, "! ")
    .replace(/\s*\bfull stop\b\s*/gi, ". ")
    .replace(/\s*\bsemi-?colon\b\s*/gi, "; ")
    .replace(/\s*\bcolon\b\s*/gi, ": ")
    .replace(/\s*\bcomma\b\s*/gi, ", ")
    // "Period" is an ordinary word too; only at the very end is it a full stop.
    .replace(/\s*\bperiod\s*$/i, ". ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

export function polishTranscript(text) {
  return applySpokenPunctuation(applyVocabulary(String(text || "").replace(/\s+/g, " ").trim()))
}

/** Of the recogniser's candidate readings, the one that uses the words we expect. */
export function chooseAlternative(candidates) {
  const readings = (candidates || []).map((item) => String(item?.transcript ?? item ?? "")).filter(Boolean)
  if (readings.length === 0) return ""
  let best = readings[0]
  let bestScore = -1
  readings.forEach((reading, index) => {
    const lower = reading.toLowerCase()
    let score = DICTATION_VOCABULARY.reduce((total, word) => total + (lower.includes(word.toLowerCase()) ? 2 : 0), 0)
    score -= index * 0.01 // the recogniser's own first choice wins a tie
    if (score > bestScore) {
      best = reading
      bestScore = score
    }
  })
  return best
}

const QUESTION_WORDS = new Set([
  "who", "what", "when", "where", "why", "how", "which", "is", "are", "am", "was", "were", "do", "does", "did",
  "can", "could", "would", "will", "should", "shall", "may", "might", "have", "has",
])

export function looksLikeQuestion(text) {
  const first = String(text).trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "")
  return QUESTION_WORDS.has(first)
}

const endsWithPunctuation = (text) => /[.,?!:;]$/.test(text) || /\n$/.test(text)
const startsWithPunctuation = (text) => /^[.,?!:;]/.test(text)
const upperFirst = (text) => text.replace(/^(\s*)(\S)/, (_, space, letter) => `${space}${letter.toUpperCase()}`)
const isProperWord = (word) => /^(?:I|I['’]\w+|Mira|Chronicles)\b/.test(word) || /^[A-Z]{2,}\b/.test(word)
const lowerFirst = (text) => (isProperWord(text) ? text : text.replace(/^(\s*)(\S)/, (_, space, letter) => `${space}${letter.toLowerCase()}`))

/** Whether the next word written after this text should begin a sentence. */
export function startsSentence(text) {
  const value = String(text || "")
  return value.trim() === "" || /[.?!]\s*$/.test(value) || /\n\s*$/.test(value)
}

/** Add dictated text to a draft with the right spacing, within a length limit. */
export function appendDictation(current, chunk, limit = Infinity) {
  if (!chunk) return current
  const glued = startsWithPunctuation(chunk) || /^\n/.test(chunk) || current === "" || /\s$/.test(current)
  return `${current}${glued ? "" : " "}${chunk}`.slice(0, limit)
}

/**
 * Turns the phrases the recogniser finishes into punctuated writing.
 *
 * A phrase is left without an ending until the next one arrives, because what
 * follows decides it: a long pause means a full stop, a short one a comma, and a
 * phrase that opens like a question ends with a question mark. `finish()` closes
 * the last one.
 */
export function createDictationFormatter({ initialText = "", pauseMs = 1400 } = {}) {
  let previous = null
  let lastFinalAt = null
  let speechStartedAt = null
  let sentenceStart = startsSentence(initialText)

  return {
    /** Called when the person starts speaking the next phrase (first interim result). */
    noteSpeech(at) {
      if (speechStartedAt == null) speechStartedAt = at
    },

    push(raw, at) {
      const phrase = polishTranscript(raw)
      if (!phrase) return ""
      const leading = startsWithPunctuation(phrase)
      let out = ""
      let capitalise = sentenceStart

      if (previous !== null) {
        let ending = ""
        if (!leading && !endsWithPunctuation(previous)) {
          const gap =
            speechStartedAt != null && lastFinalAt != null
              ? speechStartedAt - lastFinalAt
              : Math.max(0, (at ?? 0) - (lastFinalAt ?? 0) - phrase.length * 70)
          ending = looksLikeQuestion(previous) ? "?" : gap >= pauseMs ? "." : ","
        }
        out += ending
        capitalise = /[.?!]$/.test(ending) || /[.?!]$/.test(previous) || /\n$/.test(previous)
        if (ending) out += " "
      }

      const body = leading || /^\n/.test(phrase) ? phrase : capitalise ? upperFirst(phrase) : lowerFirst(phrase)
      out += body

      if (/[.?!]\s*$/.test(body) || /\n\s*$/.test(body)) {
        previous = null
        sentenceStart = true
      } else if (/[,:;]\s*$/.test(body)) {
        previous = null
        sentenceStart = false
      } else {
        previous = body
        sentenceStart = false
      }
      lastFinalAt = at ?? lastFinalAt
      speechStartedAt = null
      return out
    },

    /** The ending for the phrase still waiting for one. */
    finish() {
      if (previous === null) return ""
      const ending = looksLikeQuestion(previous) ? "?" : "."
      previous = null
      return ending
    },
  }
}

const DICTATION_ERRORS = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser's site settings to dictate.",
  "service-not-allowed": "Microphone access was blocked. Allow it in your browser's site settings to dictate.",
  "no-speech": "I didn't hear anything. Try again a little closer to the microphone.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs an internet connection in this browser.",
}

/**
 * Starts dictation. `onFinal(chunk)` receives each piece of finished, punctuated
 * text to add to the draft (use `appendDictation`), `onInterim(text)` what is
 * still being recognised. Pass the draft as `initialText` so the first word gets
 * the right capital. Returns { stop }.
 */
export function startDictation({ onFinal, onInterim, onEnd, onError, lang, initialText = "" }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new Recognition()
  const formatter = createDictationFormatter({ initialText })
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 5
  recognition.lang = lang || navigator.language || "en-US"

  recognition.onresult = (event) => {
    let interim = ""
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const readings = Array.from({ length: result.length ?? 1 }, (_, choice) => result[choice])
      const transcript = chooseAlternative(readings)
      if (result.isFinal) {
        const chunk = formatter.push(transcript, Date.now())
        if (chunk) onFinal?.(chunk)
      } else {
        interim += transcript
      }
    }
    if (interim) formatter.noteSpeech(Date.now())
    onInterim?.(interim)
  }
  recognition.onerror = (event) => {
    onError?.(DICTATION_ERRORS[event.error] || "Dictation stopped unexpectedly.")
  }
  recognition.onend = () => {
    const tail = formatter.finish()
    if (tail) onFinal?.(tail)
    onInterim?.("")
    onEnd?.()
  }
  recognition.start()
  return { stop: () => recognition.stop() }
}
