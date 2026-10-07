import { describe, expect, it } from "vitest"

import { MAX_HOURS, MAX_MINUTES, timeSpentProblem } from "./timeSpent"

describe("timeSpentProblem", () => {
  it("accepts blanks, ordinary times and the ceiling", () => {
    expect(timeSpentProblem("", "")).toBeNull()
    expect(timeSpentProblem("2", "30")).toBeNull()
    expect(timeSpentProblem("0", "59")).toBeNull()
    expect(timeSpentProblem(String(MAX_HOURS), "0")).toBeNull()
  })

  it("refuses minutes above 59 and says where the extra belongs", () => {
    expect(MAX_MINUTES).toBe(59)
    expect(timeSpentProblem("1", "60")).toMatch(/at most 59.*Hours box/)
    expect(timeSpentProblem("", "90")).toMatch(/at most 59/)
  })

  it("refuses more than ten thousand hours, including a few minutes over", () => {
    expect(timeSpentProblem("10001", "")).toMatch(/at most 10,000 hours/)
    expect(timeSpentProblem("10000", "1")).toMatch(/at most 10,000 hours/)
  })

  it("refuses negatives and fractions", () => {
    expect(timeSpentProblem("-1", "")).toMatch(/Hours must be a whole number/)
    expect(timeSpentProblem("1.5", "")).toMatch(/Hours must be a whole number/)
    expect(timeSpentProblem("", "2.5")).toMatch(/Minutes must be a whole number/)
  })
})

describe("an entry recorded above the ceiling before it existed", () => {
  it("keeps its time, but nothing else may go over", () => {
    const stored = 20000 * 60 + 30

    expect(timeSpentProblem("20000", "30", { allowTotal: stored })).toBeNull()
    expect(timeSpentProblem("20001", "0", { allowTotal: stored })).toMatch(/at most 10,000 hours/)
    expect(timeSpentProblem("20000", "75", { allowTotal: stored })).toMatch(/at most 59/)
    expect(timeSpentProblem("10001", "", { allowTotal: null })).toMatch(/at most 10,000 hours/)
  })
})
