import { afterEach, describe, expect, it, vi } from "vitest"

import {
  appendDictation, applySpokenPunctuation, applyVocabulary, chooseAlternative, createDictationFormatter,
  dictationSupported, looksLikeQuestion, polishTranscript, startDictation, startsSentence,
} from "./speech"

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("recognising the words we expect", () => {
  it("prefers the reading that contains Mira over the recogniser's first choice", () => {
    expect(chooseAlternative([{ transcript: "mirror add a task" }, { transcript: "Mira add a task" }])).toBe("Mira add a task")
  })

  it("keeps the first choice when nothing is special, and copes with nothing", () => {
    expect(chooseAlternative([{ transcript: "hello there" }, { transcript: "yellow there" }])).toBe("hello there")
    expect(chooseAlternative([])).toBe("")
    expect(chooseAlternative(["plain string"])).toBe("plain string")
  })

  it("corrects the ways Mira is misheard, however she is said", () => {
    expect(applyVocabulary("meera can you help")).toBe("Mira can you help")
    expect(applyVocabulary("ask myra about it")).toBe("ask Mira about it")
    expect(applyVocabulary("mirah's answer")).toBe("Mira's answer")
  })

  it("reads 'mirror' as Mira only when she is being spoken to", () => {
    expect(applyVocabulary("hey mirror add a task")).toBe("hey Mira add a task")
    expect(applyVocabulary("thanks, mirror")).toBe("thanks, Mira")
    expect(applyVocabulary("mirror, create a project")).toBe("Mira, create a project")
    expect(applyVocabulary("mirror can you help me")).toBe("Mira can you help me")
    expect(applyVocabulary("I looked in the mirror")).toBe("I looked in the mirror")
    expect(applyVocabulary("the mirror was cracked")).toBe("the mirror was cracked")
  })

  it("capitalises the product name and the pronoun", () => {
    expect(applyVocabulary("i use chronicles and i'm happy")).toBe("I use Chronicles and I'm happy")
  })
})

describe("spoken punctuation", () => {
  it("turns the words for punctuation into punctuation", () => {
    expect(applySpokenPunctuation("hello comma how are you question mark")).toBe("hello, how are you?")
    expect(applySpokenPunctuation("finished the report full stop next one")).toBe("finished the report. next one")
    expect(applySpokenPunctuation("wow exclamation mark")).toBe("wow!")
    expect(applySpokenPunctuation("three things colon one two")).toBe("three things: one two")
    expect(applySpokenPunctuation("first part semicolon second part")).toBe("first part; second part")
  })

  it("starts new lines and paragraphs", () => {
    expect(applySpokenPunctuation("one new line two")).toBe("one\ntwo")
    expect(applySpokenPunctuation("one new paragraph two")).toBe("one\n\ntwo")
  })

  it("treats 'period' as a full stop only at the very end", () => {
    expect(applySpokenPunctuation("that is all period")).toBe("that is all.")
    expect(applySpokenPunctuation("the time period was long")).toBe("the time period was long")
  })

  it("leaves numbers alone", () => {
    expect(polishTranscript("it took 3.5 hours")).toBe("it took 3.5 hours")
  })
})

describe("questions and sentences", () => {
  it("recognises the start of a question", () => {
    expect(looksLikeQuestion("What should I do next")).toBe(true)
    expect(looksLikeQuestion("can you add a task")).toBe(true)
    expect(looksLikeQuestion("I finished the report")).toBe(false)
  })

  it("knows when the next word starts a sentence", () => {
    expect(startsSentence("")).toBe(true)
    expect(startsSentence("Done. ")).toBe(true)
    expect(startsSentence("line one\n")).toBe(true)
    expect(startsSentence("still going")).toBe(false)
    expect(startsSentence("a comma,")).toBe(false)
  })

  it("joins dictated text with the right spacing", () => {
    expect(appendDictation("", "Hello")).toBe("Hello")
    expect(appendDictation("Hello", "world")).toBe("Hello world")
    expect(appendDictation("Hello", ", world")).toBe("Hello, world")
    expect(appendDictation("Hello", "?")).toBe("Hello?")
    expect(appendDictation("Hello ", "world")).toBe("Hello world")
    expect(appendDictation("Hello", "\nworld")).toBe("Hello\nworld")
    expect(appendDictation("Hello", "")).toBe("Hello")
    expect(appendDictation("abc", "defgh", 6)).toBe("abc de")
  })
})

describe("punctuating from pauses", () => {
  const write = (formatter, phrases) => {
    let draft = ""
    for (const { say, at, started } of phrases) {
      if (started !== undefined) formatter.noteSpeech(started)
      draft = appendDictation(draft, formatter.push(say, at))
    }
    return appendDictation(draft, formatter.finish())
  }

  it("capitalises the start, separates phrases by the length of the pause and closes the end", () => {
    const text = write(createDictationFormatter(), [
      { say: "I worked on the parser", at: 0 },
      { say: "and fixed two bugs", at: 3000, started: 400 },
      { say: "then I tested it", at: 9000, started: 7000 },
    ])
    // Short pause (400 ms): a comma and a lower case word. Long pause (4 s): a full stop.
    expect(text).toBe("I worked on the parser, and fixed two bugs. Then I tested it.")
  })

  it("ends a phrase that opens like a question with a question mark", () => {
    const text = write(createDictationFormatter(), [
      { say: "what is left to do", at: 0 },
      { say: "add a task", at: 5000, started: 4000 },
    ])
    expect(text).toBe("What is left to do? Add a task.")
  })

  it("carries on mid-sentence when the draft already has text", () => {
    const formatter = createDictationFormatter({ initialText: "Plan the week" })
    expect(formatter.push("and book the venue", 0)).toBe("and book the venue")
    expect(formatter.finish()).toBe(".")
  })

  it("starts a new sentence with a capital after a finished one", () => {
    const formatter = createDictationFormatter({ initialText: "Done. " })
    expect(formatter.push("next task", 0)).toBe("Next task")
  })

  it("keeps the pronoun and proper names capitalised mid-sentence", () => {
    const text = write(createDictationFormatter(), [
      { say: "thanks", at: 0 },
      { say: "i think mira can help", at: 500, started: 300 },
    ])
    expect(text).toBe("Thanks, I think Mira can help.")
  })

  it("uses spoken punctuation instead of guessing", () => {
    const text = write(createDictationFormatter(), [
      { say: "first comma second full stop", at: 0 },
      { say: "third", at: 6000, started: 5500 },
    ])
    expect(text).toBe("First, second. Third.")
  })

  it("lets a phrase that starts with punctuation attach to the last word", () => {
    const formatter = createDictationFormatter()
    const first = formatter.push("hello there", 0)
    const second = formatter.push("question mark", 1000)
    expect(appendDictation(first, second)).toBe("Hello there?")
    expect(formatter.finish()).toBe("")
  })

  it("ignores empty phrases and never double-ends a finished sentence", () => {
    const formatter = createDictationFormatter()
    expect(formatter.push("   ", 0)).toBe("")
    expect(formatter.push("all done period", 10)).toBe("All done.")
    expect(formatter.finish()).toBe("")
  })

  it("estimates the pause when it didn't see the speech begin", () => {
    const formatter = createDictationFormatter({ pauseMs: 1000 })
    formatter.push("first bit", 0)
    // 5 s later, for a short phrase: most of that was silence.
    expect(appendDictation("First bit", formatter.push("second bit", 5000))).toBe("First bit. Second bit")
  })
})

describe("dictation", () => {
  it("reports unsupported browsers", () => {
    expect(dictationSupported()).toBe(false)
  })

  function fakeRecognition() {
    const made = {}
    window.SpeechRecognition = class {
      constructor() { made.instance = this }
      start() { made.started = true }
      stop() { this.onend() }
    }
    return made
  }

  const result = (alternatives, isFinal) => Object.assign(alternatives.map((transcript) => ({ transcript })), { isFinal })

  it("asks for several readings, picks the one with Mira in it, and punctuates", () => {
    const made = fakeRecognition()
    const chunks = []
    const interims = []
    const ended = vi.fn()
    const session = startDictation({ onFinal: (c) => chunks.push(c), onInterim: (t) => interims.push(t), onEnd: ended })
    expect(made.started).toBe(true)
    expect(made.instance.maxAlternatives).toBe(5)

    made.instance.onresult({ resultIndex: 0, results: [result(["mirror add a task", "Mira add a task"], true), result(["for friday"], false)] })
    expect(chunks).toEqual(["Mira add a task"])
    expect(interims).toEqual(["for friday"])

    session.stop()
    expect(chunks).toEqual(["Mira add a task", "."])
    expect(interims.at(-1)).toBe("")
    expect(ended).toHaveBeenCalled()
  })

  it("starts mid-sentence when the draft already has words", () => {
    const made = fakeRecognition()
    const chunks = []
    startDictation({ initialText: "Plan the week", onFinal: (c) => chunks.push(c) })

    made.instance.onresult({ resultIndex: 0, results: [result(["and book the venue"], true)] })

    expect(chunks).toEqual(["and book the venue"])
  })

  it("reports friendly errors", () => {
    const made = fakeRecognition()
    const onError = vi.fn()
    startDictation({ onError })

    made.instance.onerror({ error: "not-allowed" })
    made.instance.onerror({ error: "weird" })

    expect(onError).toHaveBeenNthCalledWith(1, expect.stringContaining("Microphone access was blocked"))
    expect(onError).toHaveBeenNthCalledWith(2, "Dictation stopped unexpectedly.")
  })

  it("copes with a result that has no alternatives list", () => {
    const made = fakeRecognition()
    const chunks = []
    startDictation({ onFinal: (c) => chunks.push(c) })

    made.instance.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "hello" }], { isFinal: true })] })

    expect(chunks).toEqual(["Hello"])
  })
})
