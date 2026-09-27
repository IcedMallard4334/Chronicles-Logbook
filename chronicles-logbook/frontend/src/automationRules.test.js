/**
 * Entry rules, recurrence and reminders (US-3.12) — the plain helpers, and the
 * API calls the components make.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createRule,
  deleteRule,
  fetchRecurrence,
  fetchRecurrences,
  fetchReminders,
  fetchRules,
  localDateString,
  setRecurrence,
  stopRecurrence,
  updateRule,
} from "./api"
import {
  availableActionTypes,
  describeRecurrence,
  describeRule,
  dueLabel,
  emptyRule,
  newAction,
  remindersLabel,
  ruleFillableFieldIds,
  ruleForRequest,
  ruleProblem,
} from "./automationRules"

const SCHEMA = [
  { id: "f-summary", name: "Summary", type: "text" },
  { id: "f-hours", name: "Hours", type: "number" },
  { id: "f-kind", name: "Kind", type: "dropdown", options: ["Bug", "Feature"] },
  { id: "f-tags", name: "Tags", type: "tags" },
  { id: "f-when", name: "When", type: "date" },
]

describe("describing a rule in words", () => {
  it("reads conditions and actions as one sentence", () => {
    const rule = {
      match: "all",
      conditions: [
        { field_id: "f-kind", operator: "equals", value: "Bug" },
        { field_id: "f-hours", operator: "gt", value: 3 },
      ],
      actions: [
        { type: "add_tags", field_id: "f-tags", tags: ["triage"] },
        { type: "set_field", field_id: "f-summary", value: "Needs triage", overwrite: false },
        { type: "mark_todo", due_in_days: 3 },
      ],
    }

    expect(describeRule(rule, SCHEMA)).toBe(
      "When Kind is Bug and Hours is more than 3: add tag triage to Tags; " +
        "fill in Summary with Needs triage; mark it as to-do, due in 3 days."
    )
  })

  it("says 'or' for match-any and 'every new entry' with no conditions", () => {
    const any = {
      match: "any",
      conditions: [
        { field_id: "f-kind", operator: "in", value: ["Bug", "Feature"] },
        { field_id: "f-hours", operator: "between", value: 1, value2: 2 },
      ],
      actions: [{ type: "mark_todo", due_in_days: 1 }],
    }
    expect(describeRule(any, SCHEMA)).toBe(
      "When Kind is one of Bug, Feature or Hours is between 1 and 2: mark it as to-do, due in 1 day."
    )
    expect(describeRule({ conditions: [], actions: [{ type: "mark_todo", due_in_days: null }] }, SCHEMA)).toBe(
      "For every new entry: mark it as to-do."
    )
  })

  it("names a field that has since been removed rather than showing its id", () => {
    const rule = { conditions: [], actions: [{ type: "set_field", field_id: "gone", value: 1, overwrite: true }] }
    expect(describeRule(rule, SCHEMA)).toBe("For every new entry: set a removed field with 1.")
  })

  it("describes the other action and condition shapes", () => {
    const rule = {
      conditions: [{ field_id: "f-summary", operator: "is_set" }],
      actions: [
        { type: "add_tags", field_id: "f-tags", tags: ["a", "b"] },
        { type: "mark_todo", due_in_days: 0 },
      ],
    }
    expect(describeRule(rule, SCHEMA)).toBe(
      "When Summary is_set: add tags a, b to Tags; mark it as to-do, due the same day."
    )
  })
})

describe("building a rule", () => {
  it("only offers actions the schema can support", () => {
    expect(availableActionTypes(SCHEMA).map((type) => type.value)).toEqual(["add_tags", "set_field", "mark_todo"])
    expect(availableActionTypes([{ id: "c", name: "C", type: "checklist" }]).map((type) => type.value)).toEqual([
      "mark_todo",
    ])
  })

  it("starts new actions pointed at a field they can use", () => {
    expect(newAction("add_tags", SCHEMA)).toEqual({ type: "add_tags", field_id: "f-tags", tags: [] })
    expect(newAction("set_field", SCHEMA)).toEqual({ type: "set_field", field_id: "f-summary", value: "", overwrite: false })
    expect(newAction("mark_todo", SCHEMA)).toEqual({ type: "mark_todo", due_in_days: null })
    expect(emptyRule(SCHEMA).actions[0].type).toBe("add_tags")
  })

  it("explains what's missing before anything is sent", () => {
    const base = emptyRule(SCHEMA)
    expect(ruleProblem(base, SCHEMA)).toBe("Give the rule a name.")
    expect(ruleProblem({ ...base, name: "x", actions: [] }, SCHEMA)).toMatch(/at least one thing/)
    expect(ruleProblem({ ...base, name: "x" }, SCHEMA)).toBe("Enter at least one tag to add.")
    const fill = (field_id, value) => ({ ...base, name: "x", actions: [{ type: "set_field", field_id, value }] })
    expect(ruleProblem(fill("nope", "a"), SCHEMA)).toMatch(/Choose which field/)
    expect(ruleProblem(fill("f-summary", "  "), SCHEMA)).toMatch(/Enter the text/)
    expect(ruleProblem(fill("f-hours", "abc"), SCHEMA)).toMatch(/Enter a number/)
    expect(ruleProblem(fill("f-when", ""), SCHEMA)).toMatch(/Choose a date/)
    expect(ruleProblem(fill("f-hours", "4"), SCHEMA)).toBeNull()
  })

  it("sends numbers as numbers and nothing the API doesn't know", () => {
    const rule = {
      name: "  Long bugs  ",
      enabled: true,
      match: "all",
      conditions: [{ field_id: "f-hours", operator: "gt", value: 5, value2: undefined }],
      actions: [
        { type: "set_field", field_id: "f-hours", value: "8", overwrite: undefined },
        { type: "mark_todo", due_in_days: "" },
        { type: "add_tags", field_id: "f-tags", tags: ["x"], extra: "dropped" },
      ],
    }
    expect(ruleForRequest(rule, SCHEMA)).toEqual({
      name: "Long bugs",
      enabled: true,
      match: "all",
      conditions: [{ field_id: "f-hours", operator: "gt", value: 5 }],
      actions: [
        { type: "set_field", field_id: "f-hours", value: 8, overwrite: false },
        { type: "mark_todo", due_in_days: null },
        { type: "add_tags", field_id: "f-tags", tags: ["x"] },
      ],
    })
  })

  it("knows which fields an enabled rule may fill", () => {
    const rules = [
      { enabled: true, actions: [{ type: "set_field", field_id: "f-kind" }, { type: "mark_todo" }] },
      { enabled: true, actions: [{ type: "add_tags", field_id: "f-tags" }] },
      { enabled: false, actions: [{ type: "set_field", field_id: "f-summary" }] },
    ]
    expect([...ruleFillableFieldIds(rules)].sort()).toEqual(["f-kind", "f-tags"])
    expect(ruleFillableFieldIds(undefined).size).toBe(0)
  })
})

describe("recurrence and reminder wording", () => {
  it("describes how often an entry repeats", () => {
    expect(describeRecurrence({ frequency: "weekly", interval: 1 })).toBe("Repeats every week")
    expect(describeRecurrence({ frequency: "monthly", interval: 3 })).toBe("Repeats every 3 months")
    expect(describeRecurrence({ frequency: "hourly", interval: 1 })).toBe("Repeats")
  })

  it("says how late or how soon something is due, in words", () => {
    expect(dueLabel({ status: "overdue", days_until: -1 })).toBe("1 day late")
    expect(dueLabel({ status: "overdue", days_until: -4 })).toBe("4 days late")
    expect(dueLabel({ status: "due_today", days_until: 0 })).toBe("today")
    expect(dueLabel({ status: "upcoming", days_until: 1 })).toBe("tomorrow")
    expect(dueLabel({ status: "upcoming", days_until: 5 })).toBe("in 5 days")
  })

  it("summarises the reminders for a screen reader", () => {
    expect(remindersLabel({ overdue_count: 2, due_today_count: 0, upcoming_count: 1 })).toBe(
      "Reminders: 2 overdue, 1 coming up"
    )
  })
})

// ── API calls ────────────────────────────────────────────────────────────────

const BASE = "http://localhost:8000"
const ok = (body, status = 200) => ({ ok: true, status, json: async () => body })
const noContent = () => ({ ok: true, status: 204, json: async () => null })
const failure = (status, detail) => ({ ok: false, status, json: async () => ({ detail }) })

describe("automation API calls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    window.localStorage.clear()
  })

  it("formats the device's own date", () => {
    expect(localDateString(new Date(2026, 0, 5, 1, 30))).toBe("2026-01-05")
  })

  it("lists, creates, replaces and deletes rules", async () => {
    fetch.mockResolvedValueOnce(ok([]))
    await fetchRules("p1")
    expect(fetch).toHaveBeenLastCalledWith(`${BASE}/projects/p1/rules`, expect.any(Object))

    fetch.mockResolvedValueOnce(ok({ id: "r1" }, 201))
    await createRule("p1", { name: "R" })
    expect(fetch.mock.lastCall[1]).toMatchObject({ method: "POST", body: JSON.stringify({ name: "R" }) })

    fetch.mockResolvedValueOnce(ok({ id: "r1" }))
    await updateRule("p1", "r1", { name: "R2" })
    expect(fetch.mock.lastCall[0]).toBe(`${BASE}/projects/p1/rules/r1`)
    expect(fetch.mock.lastCall[1].method).toBe("PUT")

    fetch.mockResolvedValueOnce(noContent())
    await expect(deleteRule("p1", "r1")).resolves.toBeNull()
    expect(fetch.mock.lastCall[1].method).toBe("DELETE")
  })

  it("sends the local date with recurrence and reminder requests", async () => {
    const today = localDateString()

    fetch.mockResolvedValueOnce(ok([]))
    await fetchRecurrences("p1")
    expect(fetch.mock.lastCall[0]).toBe(`${BASE}/projects/p1/recurrences?today=${today}`)

    fetch.mockResolvedValueOnce(ok({ id: "rec" }, 201))
    await setRecurrence("p1", "e1", { frequency: "daily" })
    expect(fetch.mock.lastCall[0]).toBe(`${BASE}/projects/p1/entries/e1/recurrence?today=${today}`)
    expect(fetch.mock.lastCall[1].method).toBe("PUT")

    fetch.mockResolvedValueOnce(ok({ items: [] }))
    await fetchReminders(14)
    expect(fetch.mock.lastCall[0]).toBe(`${BASE}/reminders?within_days=14&today=${today}`)
  })

  it("treats 'this entry doesn't repeat' as null, not an error", async () => {
    fetch.mockResolvedValueOnce(failure(404, "This entry does not repeat."))
    await expect(fetchRecurrence("p1", "e1")).resolves.toBeNull()

    fetch.mockResolvedValueOnce(failure(500, "Broken"))
    await expect(fetchRecurrence("p1", "e1")).rejects.toMatchObject({ status: 500 })

    fetch.mockResolvedValueOnce(noContent())
    await stopRecurrence("p1", "e1")
    expect(fetch.mock.lastCall[1].method).toBe("DELETE")
  })
})
