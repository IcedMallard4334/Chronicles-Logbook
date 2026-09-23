import { describe, expect, it } from "vitest"
import { dateKey, monthDays, groupGoogleEvents } from "./calendarDates"

describe("integrated calendar dates", () => {
  it("uses the selected local date rather than UTC", () => {
    const date = new Date(2026, 7, 31, 0, 15)
    expect(dateKey(date)).toBe("2026-08-31")
  })
  it("fills six complete weeks including neighbouring months", () => {
    const days = monthDays(2026, 7)
    expect(days).toHaveLength(42)
    expect(days[0].getDay()).toBe(0)
    expect(dateKey(days[0])).toBe("2026-07-26")
    expect(dateKey(days[41])).toBe("2026-09-05")
  })
  it("shows all-day events across days, excluding Google's end date", () => {
    const map = groupGoogleEvents([{ id: "a", all_day: true, start: "2026-08-30", end: "2026-09-02" }], monthDays(2026,7))
    expect([...map.keys()]).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"])
  })
  it("shows timed overnight events on both local days", () => {
    const map=groupGoogleEvents([{id:"a",all_day:false,start:new Date(2026,7,30,23).toISOString(),end:new Date(2026,7,31,1).toISOString()}],monthDays(2026,7))
    expect([...map.keys()]).toEqual(["2026-08-30","2026-08-31"])
  })
  it("does not show an event ending at midnight on the next day", () => {
    const map=groupGoogleEvents([{id:"a",all_day:false,start:new Date(2026,7,30,22).toISOString(),end:new Date(2026,7,31).toISOString()}],monthDays(2026,7))
    expect([...map.keys()]).toEqual(["2026-08-30"])
  })
})
