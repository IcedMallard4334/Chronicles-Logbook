import { describe, expect, it } from "vitest"

import { TRAVEL_SECONDS, WALKTHROUGHS, clock, stateAt, transcript } from "./walkthroughs"

const script = {
  duration: 20,
  steps: [
    { at: 0, caption: "First.", set: { screen: "home" } },
    { at: 2, target: "button", click: true },
    { at: 5, caption: "Second.", set: { screen: "next", drawer: true } },
    { at: 6, type: { key: "name", text: "abcd", over: 2 } },
    { at: 10, target: "other", set: { drawer: false } },
  ],
}

describe("stateAt", () => {
  it("is the first step's picture at the very start", () => {
    expect(stateAt(script, 0)).toMatchObject({ caption: "First.", values: { screen: "home" }, target: null, clicking: false, step: 0 })
  })

  it("keeps the last caption and the last target until a step changes them", () => {
    const state = stateAt(script, 4)
    expect(state.caption).toBe("First.")
    expect(state.target).toBe("button")
    expect(stateAt(script, 7).caption).toBe("Second.")
  })

  it("applies what each step sets, in order", () => {
    expect(stateAt(script, 5.5).values).toMatchObject({ screen: "next", drawer: true })
    expect(stateAt(script, 11).values.drawer).toBe(false)
  })

  it("clicks once the cursor has arrived, briefly", () => {
    expect(stateAt(script, 2 + TRAVEL_SECONDS - 0.1).clicking).toBe(false)
    expect(stateAt(script, 2 + TRAVEL_SECONDS + 0.1).clicking).toBe(true)
    expect(stateAt(script, 2 + TRAVEL_SECONDS + 0.6).clicking).toBe(false)
  })

  it("types a little more each moment, and all of it afterwards", () => {
    expect(stateAt(script, 6).values.name).toBe("")
    expect(stateAt(script, 7).values.name).toBe("ab")
    expect(stateAt(script, 8).values.name).toBe("abcd")
    expect(stateAt(script, 15).values.name).toBe("abcd")
  })

  it("gives the same picture for the same time however it is reached", () => {
    const forwards = stateAt(script, 7)
    stateAt(script, 15)
    expect(stateAt(script, 7)).toEqual(forwards)
  })

  it("does not click for a step that does not click", () => {
    expect(stateAt(script, 10 + TRAVEL_SECONDS + 0.1).clicking).toBe(false)
  })

  it("types the whole text at once for a step with no duration", () => {
    expect(stateAt({ steps: [{ at: 0, type: { key: "k", text: "whole" } }] }, 0).values.k).toBe("whole")
  })
})

describe("clock", () => {
  it("writes seconds as minutes and seconds", () => {
    expect(clock(0)).toBe("0:00")
    expect(clock(9.9)).toBe("0:09")
    expect(clock(64)).toBe("1:04")
    expect(clock(-3)).toBe("0:00")
  })
})

describe("transcript", () => {
  it("is the captions in order, with when they appear", () => {
    expect(transcript(script)).toEqual([{ at: 0, text: "First." }, { at: 5, text: "Second." }])
  })
})

describe("the first-logbook walkthrough", () => {
  const first = WALKTHROUGHS["first-logbook"]

  it("is about a minute and its steps are in time order, inside its length", () => {
    expect(first.duration).toBeGreaterThanOrEqual(55)
    expect(first.duration).toBeLessThanOrEqual(75)
    const times = first.steps.map((step) => step.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(Math.max(...times)).toBeLessThan(first.duration)
  })

  it("makes the project, adds a field and logs an entry, in that order", () => {
    expect(stateAt(first, 20).values).toMatchObject({ drawer: true, name: "Gym log" })
    expect(stateAt(first, 46).values).toMatchObject({ extraField: true, extraName: "Weight (kg)", extraType: "Number" })
    expect(stateAt(first, 56).values).toMatchObject({ screen: "project", drawer: false })
    expect(stateAt(first, 66).values).toMatchObject({ saved: true, entryTitle: "Leg day", entryWeight: "80" })
  })

  it("explains each step in words", () => {
    expect(transcript(first).length).toBeGreaterThanOrEqual(10)
    expect(transcript(first).every((line) => line.text.length > 10)).toBe(true)
  })
})
