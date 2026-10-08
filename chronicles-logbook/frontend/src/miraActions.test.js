import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => {
  const names = [
    "archiveProject", "createCalendarActivity", "createCustomStatistic", "createEntry", "createProject", "createRule",
    "createTask", "deleteCalendarActivity", "deleteEntry", "deleteProject", "deleteTask", "fetchCalendarActivities",
    "fetchEntry", "fetchProject", "fetchProjects", "fetchTasks", "setRecurrence", "shareProject", "stopRecurrence",
    "toggleTask", "fetchDashboard", "updateDashboardPanels", "unarchiveProject", "updateCalendarActivity", "updateEntry", "updateProject", "updateSchema", "updateTask",
  ]
  return Object.fromEntries(names.map((name) => [name, vi.fn()]))
})

import * as api from "./api"
import {
  SUPPORTED_ACTIONS, activityTimes, buildField, findField, findProject, mapValues, missingRequiredFields, outcomeNote, pageToView,
  prepareEntry, resolveExpression, runActions, takeBuiltIns,
} from "./miraActions"

const HOURS = { id: "f-hours", name: "Hours", type: "number" }
const KIND = { id: "f-kind", name: "Kind", type: "dropdown", options: ["Bug", "Feature"] }
const TAGS = { id: "f-tags", name: "Labels", type: "tags" }
const LIST = { id: "f-list", name: "Steps", type: "checklist" }

const bugLog = { id: "p1", name: "Bug Log", entry_schema: [HOURS, KIND, TAGS, LIST], shared: false }
const research = { id: "p2", name: "Research", entry_schema: [], shared: false }

const act = (type, payload, summary = type) => ({ type, payload, summary })

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchProjects.mockResolvedValue([structuredClone(bugLog), structuredClone(research)])
  api.fetchProject.mockImplementation(async (id) => structuredClone([bugLog, research].find((p) => p.id === id)))
  window.localStorage.clear()
})

describe("finding things by the names people use", () => {
  const projects = [bugLog, research, { id: "p3", name: "Bug Log 2", entry_schema: [] }]

  it("finds a project by id, exact name, or an unambiguous part of it", () => {
    expect(findProject("p2", projects)).toBe(research)
    expect(findProject("bug log", projects)).toBe(bugLog)
    expect(findProject("resea", projects)).toBe(research)
  })

  it("refuses names that match nothing or several projects", () => {
    expect(() => findProject("Nope", projects)).toThrow("I couldn't find a project called “Nope”.")
    expect(() => findProject("Bug", projects)).toThrow("I couldn't find")
    expect(() => findProject("Dup", [{ id: "a", name: "Dup" }, { id: "b", name: "dup" }])).toThrow("More than one project")
  })

  it("finds a field by id or name, and says when it is missing", () => {
    expect(findField(bugLog, "f-kind")).toBe(KIND)
    expect(findField(bugLog, "HOURS")).toBe(HOURS)
    expect(() => findField(bugLog, "Colour")).toThrow("“Bug Log” has no field called “Colour”.")
  })

  it("turns {Field name} in an expression into field ids", () => {
    expect(resolveExpression("{Hours} * 2", [HOURS])).toBe("{f-hours} * 2")
    expect(() => resolveExpression("{Nope}", [HOURS])).toThrow("isn't a field here")
  })
})

describe("building fields and values", () => {
  it("builds a field with a new id, and checks dropdowns and calculations", () => {
    const text = buildField({ name: " Notes " })
    expect(text).toMatchObject({ name: "Notes", type: "text" })
    expect(text.id).toEqual(expect.any(String))
    expect(buildField({ name: "Kind", type: "dropdown", options: ["A"] }).options).toEqual(["A"])
    expect(() => buildField({ name: "Kind", type: "dropdown" })).toThrow("needs at least one option")
    expect(() => buildField({ name: "Total", type: "computed" })).toThrow("needs an expression")
    expect(buildField({ name: "Total", type: "computed", expression: "{Hours} * 2" }, [HOURS]).expression).toBe("{f-hours} * 2")
  })

  it("maps field names to ids and coerces what each type expects", () => {
    const data = mapValues(bugLog, { Hours: "2.5", Kind: "Bug", Labels: "a, b", Steps: ["one", { text: "two", completed: true }] })

    expect(data["f-hours"]).toBe(2.5)
    expect(data["f-kind"]).toBe("Bug")
    expect(data["f-tags"]).toEqual(["a", "b"])
    expect(data["f-list"]).toEqual([
      expect.objectContaining({ text: "one", completed: false }),
      expect.objectContaining({ text: "two", completed: true }),
    ])
    expect(() => mapValues(bugLog, { Hours: "lots" })).toThrow("needs a number")
    expect(() => mapValues(bugLog, { Nope: 1 })).toThrow("no field called")
  })
})

describe("running actions", () => {
  it("supports every action the server can propose", () => {
    expect(SUPPORTED_ACTIONS).toHaveLength(27)
  })

  it("creates a project with fields and statuses, then uses it by name in the next action", async () => {
    api.createProject.mockImplementation(async (body) => ({ id: "p9", ...body }))
    api.fetchProject.mockImplementation(async (id) => (id === "p9" ? { id: "p9", name: "Launch", entry_schema: [] } : null))
    api.createTask.mockResolvedValue({})

    const outcome = await runActions([
      act("create_project", { name: "Launch", description: "Q4", fields: [{ name: "Hours", type: "number" }], statuses: [{ name: "Open" }, { name: "Closed", done: true }] }),
      act("create_task", { project: "Launch", title: "Write copy", due_date: "2026-10-05", checklist: ["a", "b"] }),
    ])

    const [body] = api.createProject.mock.calls[0]
    expect(body).toMatchObject({ name: "Launch", description: "Q4", statuses: [{ name: "Open" }, { name: "Closed", done: true }] })
    expect(body.entry_schema[0]).toMatchObject({ name: "Hours", type: "number" })
    expect(api.createTask).toHaveBeenCalledWith("p9", expect.objectContaining({
      title: "Write copy", due_date: "2026-10-05", checklist: [expect.objectContaining({ text: "a" }), expect.objectContaining({ text: "b" })],
    }))
    expect(outcome).toEqual({ done: ["Created project “Launch”", "Added the task “Write copy” to “Launch”"], failed: null, skipped: 0 })
  })

  it("won't create a project that already exists", async () => {
    const outcome = await runActions([act("create_project", { name: "bug log" })])
    expect(api.createProject).not.toHaveBeenCalled()
    expect(outcome.failed.error).toBe("A project called “bug log” already exists.")
  })

  it("updates, re-statuses, archives, unarchives and deletes projects", async () => {
    api.updateProject.mockResolvedValue({ id: "p1", name: "Renamed" })
    api.archiveProject.mockResolvedValue({ id: "p1", archived: true })
    api.unarchiveProject.mockResolvedValue({ id: "p1", archived: false })
    api.deleteProject.mockResolvedValue(null)

    const outcome = await runActions([
      act("update_project", { project: "Bug Log", name: "Renamed", description: "New" }),
      act("set_statuses", { project: "p1", statuses: [{ name: "A" }, { name: "B", done: true }] }),
      act("archive_project", { project: "p1" }),
      act("archive_project", { project: "p1", archive: false }),
      act("delete_project", { project: "Research" }),
    ])

    expect(api.updateProject).toHaveBeenNthCalledWith(1, "p1", { name: "Renamed", description: "New" })
    expect(api.updateProject).toHaveBeenNthCalledWith(2, "p1", { statuses: [{ name: "A" }, { name: "B", done: true }] })
    expect(api.archiveProject).toHaveBeenCalledWith("p1")
    expect(api.unarchiveProject).toHaveBeenCalledWith("p1")
    expect(api.deleteProject).toHaveBeenCalledWith("p2")
    expect(outcome.failed).toBeNull()
    expect(outcome.done).toHaveLength(5)
  })

  it("adds, renames and removes fields by rewriting the schema", async () => {
    api.updateSchema.mockImplementation(async (id, schema) => ({ id, entry_schema: schema }))

    await runActions([act("add_field", { project: "Bug Log", field: { name: "Owner" } })])
    expect(api.updateSchema.mock.calls[0][1].map((f) => f.name)).toEqual(["Hours", "Kind", "Labels", "Steps", "Owner"])

    await runActions([act("rename_field", { project: "Bug Log", field: "Hours", new_name: "Time" })])
    expect(api.updateSchema.mock.calls[1][1][0]).toMatchObject({ id: "f-hours", name: "Time" })

    await runActions([act("remove_field", { project: "Bug Log", field: "Kind" })])
    expect(api.updateSchema.mock.calls[2][1].map((f) => f.id)).toEqual(["f-hours", "f-tags", "f-list"])
  })

  it("logs entries with values keyed by field name, and updates them keeping the rest", async () => {
    api.createEntry.mockResolvedValue({})
    api.fetchEntry.mockResolvedValue({ data: { "f-hours": 1, "f-kind": "Bug" } })
    api.updateEntry.mockResolvedValue({})
    api.deleteEntry.mockResolvedValue(null)

    await runActions([
      act("create_entry", { project: "Bug Log", values: { Hours: 2, Kind: "Feature" }, title: "Parser", time_spent_minutes: 90, todo: true, status: "Still to do", due_date: "2026-10-01", due_time: "09:30" }),
      act("update_entry", { entry: "p1/e1", values: { Hours: 4 }, status: "Done" }),
      act("delete_entry", { entry: "p1/e1" }),
    ])

    expect(api.createEntry).toHaveBeenCalledWith("p1", {
      data: { "f-hours": 2, "f-kind": "Feature", "f-list": [] }, title: "Parser", time_spent: 90, todo: true, status: "Still to do", due_date: "2026-10-01", due_time: "09:30",
    })
    expect(api.updateEntry).toHaveBeenCalledWith("p1", "e1", { status: "Done", data: { "f-hours": 4, "f-kind": "Bug" } })
    expect(api.deleteEntry).toHaveBeenCalledWith("p1", "e1")
  })

  it("updates an entry's plain fields without reading it first", async () => {
    api.updateEntry.mockResolvedValue({})
    await runActions([act("update_entry", { entry: "p1/e1", title: "Retitled" })])
    expect(api.fetchEntry).not.toHaveBeenCalled()
    expect(api.updateEntry).toHaveBeenCalledWith("p1", "e1", { title: "Retitled" })
  })

  it("needs an item as project-id/item-id", async () => {
    const outcome = await runActions([act("delete_task", { task: "just-an-id" })])
    expect(outcome.failed.error).toMatch("project-id/item-id")
  })

  it("edits, finishes, reopens and deletes tasks", async () => {
    api.updateTask.mockResolvedValue({})
    api.toggleTask.mockResolvedValue({})
    api.deleteTask.mockResolvedValue(null)
    api.fetchTasks.mockResolvedValue([{ id: "t1", title: "Ship", completed: false }])

    const outcome = await runActions([
      act("update_task", { task: "p1/t1", title: "Ship it", description: "", due_date: "2026-10-02" }),
      act("complete_task", { task: "p1/t1" }),
      act("complete_task", { task: "p1/t1", completed: false }),
      act("delete_task", { task: "p1/t1" }),
    ])

    expect(api.updateTask).toHaveBeenCalledWith("p1", "t1", { title: "Ship it", description: "", due_date: "2026-10-02" })
    expect(api.toggleTask).toHaveBeenCalledTimes(1)
    expect(outcome.done).toEqual(["Updated a task", "Marked “Ship” done", "Reopened “Ship”", "Deleted a task"])
    expect(api.deleteTask).toHaveBeenCalledWith("p1", "t1")
  })

  it("leaves a task alone when it is already in the wanted state", async () => {
    api.fetchTasks.mockResolvedValue([{ id: "t1", title: "Ship", completed: true }])
    await runActions([act("complete_task", { task: "p1/t1" })])
    expect(api.toggleTask).not.toHaveBeenCalled()
  })

  it("says so when a task has gone", async () => {
    api.fetchTasks.mockResolvedValue([])
    const outcome = await runActions([act("complete_task", { task: "p1/t1" })])
    expect(outcome.failed.error).toBe("I couldn't find that task any more.")
  })

  it("schedules, edits and deletes activities", async () => {
    api.createCalendarActivity.mockResolvedValue({})
    api.updateCalendarActivity.mockResolvedValue({})
    api.deleteCalendarActivity.mockResolvedValue(null)
    api.fetchCalendarActivities.mockResolvedValue([
      { id: "a1", title: "Standup", description: "", day: "2026-10-01", all_day: false, start_time: "09:00", end_time: "09:30" },
    ])

    await runActions([
      act("create_activity", { title: "Planning", day: "2026-10-02" }),
      act("create_activity", { title: "Holiday", day: "2026-10-03", all_day: true }),
      act("update_activity", { activity: "a1", title: "Standup v2", all_day: true }),
      act("delete_activity", { activity: "a1" }),
    ])

    expect(api.createCalendarActivity).toHaveBeenNthCalledWith(1, { title: "Planning", description: "", day: "2026-10-02", all_day: true, start_time: null, end_time: null })
    expect(api.createCalendarActivity).toHaveBeenNthCalledWith(2, expect.objectContaining({ all_day: true, start_time: null, end_time: null }))
    expect(api.updateCalendarActivity).toHaveBeenCalledWith("a1", {
      title: "Standup v2", description: "", day: "2026-10-01", all_day: true, start_time: null, end_time: null,
    })
    expect(api.deleteCalendarActivity).toHaveBeenCalledWith("a1")
  })

  it("says so when an activity has gone", async () => {
    api.fetchCalendarActivities.mockResolvedValue([])
    const outcome = await runActions([act("update_activity", { activity: "a1", title: "x" })])
    expect(outcome.failed.error).toBe("I couldn't find that activity any more.")
  })

  it("sets reminders on tasks and entries, and repeats and stops repeating entries", async () => {
    api.updateTask.mockResolvedValue({})
    api.updateEntry.mockResolvedValue({})
    api.setRecurrence.mockResolvedValue({})
    api.stopRecurrence.mockResolvedValue(null)

    await runActions([
      act("set_reminder", { kind: "task", target: "p1/t1", due_date: "2026-10-01" }),
      act("set_reminder", { kind: "entry", target: "p1/e1", due_date: "2026-10-02", due_time: "08:00" }),
      act("set_recurrence", { entry: "p1/e1", frequency: "weekly", interval: 2, ends_on: "2026-12-31" }),
      act("stop_recurrence", { entry: "p1/e1" }),
    ])

    expect(api.updateTask).toHaveBeenCalledWith("p1", "t1", { due_date: "2026-10-01", due_time: null })
    expect(api.updateEntry).toHaveBeenCalledWith("p1", "e1", { todo: true, due_date: "2026-10-02", due_time: "08:00" })
    expect(api.setRecurrence).toHaveBeenCalledWith("p1", "e1", { frequency: "weekly", interval: 2, ends_on: "2026-12-31" })
    expect(api.stopRecurrence).toHaveBeenCalledWith("p1", "e1")
  })

  it("creates rules, resolving field names to ids", async () => {
    api.createRule.mockResolvedValue({})

    await runActions([act("create_rule", {
      project: "Bug Log", name: "Flag bugs", match: "any",
      conditions: [{ field: "Kind", operator: "equals", value: "Bug" }],
      actions: [
        { type: "mark_todo", due_in_days: 2 },
        { type: "add_tags", field: "Labels", tags: ["urgent"] },
        { type: "set_field", field: "Hours", value: "1" },
      ],
    })])

    expect(api.createRule).toHaveBeenCalledWith("p1", {
      name: "Flag bugs", enabled: true, match: "any",
      conditions: [{ field_id: "f-kind", operator: "equals", value: "Bug" }],
      actions: [
        { type: "mark_todo", due_in_days: 2 },
        { type: "add_tags", field_id: "f-tags", tags: ["urgent"] },
        { type: "set_field", field_id: "f-hours", value: "1", overwrite: false },
      ],
    })
  })

  it("shares projects and saves statistics", async () => {
    api.shareProject.mockResolvedValue({})
    api.createCustomStatistic.mockResolvedValue({})

    await runActions([
      act("share_project", { project: "Bug Log", email: "a@b.co" }),
      act("create_statistic", { project: "Bug Log", name: "Total", expression: "SUM({Hours})" }),
    ])

    expect(api.shareProject).toHaveBeenCalledWith("p1", "a@b.co")
    expect(api.createCustomStatistic).toHaveBeenCalledWith({ project_id: "p1", name: "Total", expression: "SUM({f-hours})" })
  })

  it("navigates and switches theme without touching the API", async () => {
    const navigate = vi.fn()

    const outcome = await runActions([act("open_page", { page: "board" }), act("set_theme", { theme: "dark" })], { navigate })

    expect(navigate).toHaveBeenCalledWith("board")
    expect(window.localStorage.getItem("chronicles-theme")).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(outcome.done).toEqual(["Opened board", "Switched to the dark theme"])
    document.documentElement.removeAttribute("data-theme")
  })

  it("stops at the first failure and counts what was skipped", async () => {
    api.createTask.mockRejectedValueOnce(new Error("Cannot add tasks to an archived project."))

    const outcome = await runActions([
      act("create_task", { project: "Bug Log", title: "A" }, "Add task A"),
      act("create_task", { project: "Bug Log", title: "B" }),
      act("create_task", { project: "Bug Log", title: "C" }),
    ])

    expect(outcome).toEqual({ done: [], failed: { summary: "Add task A", error: "Cannot add tasks to an archived project." }, skipped: 2 })
    expect(api.createTask).toHaveBeenCalledTimes(1)
  })

  it("refuses an action it has no handler for", async () => {
    const outcome = await runActions([act("launch_rocket", {})])
    expect(outcome.failed.error).toBe("Mira can't do that yet.")
  })

  it("maps page names to app views", () => {
    expect(pageToView("board")).toBe("board")
    expect(pageToView("assistant")).toBe("assistant")
    expect(pageToView("profile")).toBeNull()
  })
})

describe("telling Mira how it went", () => {
  it("lists what was done", () => {
    expect(outcomeNote({ done: ["Made A", "Made B"], failed: null, skipped: 0 })).toBe("- ✓ Made A\n- ✓ Made B")
  })

  it("says what failed and why, without the server's technical prefix, and how many were left", () => {
    expect(outcomeNote({ done: ["Made A"], failed: { summary: "Make B", error: "Value error, No." }, skipped: 2 })).toBe(
      "- ✓ Made A\n- ✗ Make B: No.\n- 2 more actions were not run."
    )
    expect(outcomeNote({ done: [], failed: { summary: "Make A", error: "No." }, skipped: 1 })).toContain("1 more action was not run.")
  })

  it("stays within what the server accepts as a message", () => {
    expect(outcomeNote({ done: Array.from({ length: 200 }, (_, i) => `Made number ${i}`), failed: null, skipped: 0 }).length).toBeLessThanOrEqual(1900)
  })
})

describe("entries, in the project's own terms", () => {
  const PLACE = { id: "f-place", name: "Place", type: "text" }
  const STORY = { id: "f-story", name: "Story", type: "long_text", required: false }
  const WHEN = { id: "f-when", name: "When", type: "date", required: false }
  const garden = {
    id: "p9", name: "Garden", shared: false,
    entry_schema: [PLACE, STORY, WHEN, KIND, TAGS, LIST, { id: "f-total", name: "Total", type: "computed", expression: "1" }],
  }

  it("treats a title, hours or minutes keyed like a field as the entry's own, unless the project has a field of that name", () => {
    expect(takeBuiltIns(garden, { Title: "Weeding", Hours: "2", "Minutes spent": 30, Place: "Back" })).toEqual({
      built: { title: "Weeding", hours: 2, minutes: 30 }, rest: { Place: "Back" },
    })
    const hoursProject = { entry_schema: [HOURS] }
    expect(takeBuiltIns(hoursProject, { Hours: 3 })).toEqual({ built: {}, rest: { Hours: 3 } })
  })

  it("logs the title and time from wherever Mira put them", () => {
    const { data, extras } = prepareEntry(garden, {
      values: { Title: "Weeding", Hours: 1, Minutes: 15, Place: "Back", Labels: "a, b", Kind: "bug" },
    })

    expect(extras).toEqual({ title: "Weeding", time_spent: 75 })
    expect(data).toMatchObject({ "f-place": "Back", "f-tags": ["a", "b"], "f-kind": "Bug", "f-list": [] })
  })

  it("prefers the title and minutes she gave outright", () => {
    const { extras } = prepareEntry(garden, { title: "Real", time_spent_minutes: 10, values: { Title: "Other", Hours: 5, Place: "x", Kind: "Bug", Labels: ["t"] } })

    expect(extras).toEqual({ title: "Real", time_spent: 10 })
  })

  it("asks for exactly the required fields that are empty, and only for a finished entry", () => {
    expect(() => prepareEntry(garden, { title: "Weeding", values: { Kind: "Bug" } })).toThrow(
      "“Garden” needs Place and Labels before this entry can be logged."
    )
    expect(missingRequiredFields(garden, {}, { todo: true })).toEqual([])
    expect(missingRequiredFields(garden, {}, { status: "Still to do" })).toEqual([])
    expect(missingRequiredFields(garden, {}, {})).toEqual(["Place", "Kind", "Labels"])
    // A field marked optional, a calculation, a link and a checklist are never asked for.
    expect(missingRequiredFields(garden, { "f-place": "x", "f-kind": "Bug", "f-tags": ["t"] }, {})).toEqual([])
  })

  it("lets planned work through with nothing filled in", () => {
    expect(prepareEntry(garden, { title: "Later", todo: true, values: {} }).data).toEqual({ "f-list": [] })
  })

  it("needs a title", () => {
    expect(() => prepareEntry(garden, { values: { Place: "x", Kind: "Bug", Labels: ["t"] } })).toThrow("This entry needs a title.")
  })

  it("says what is wrong with a value in the field's own words", () => {
    expect(() => mapValues(garden, { Place: "x".repeat(256) })).toThrow("“Place” can hold at most 255 characters, and this is 256.")
    expect(() => mapValues(garden, { Story: "x".repeat(5001) })).toThrow("“Story” can hold at most 5,000 characters, and this is 5,001.")
    expect(() => mapValues(garden, { When: "tomorrow" })).toThrow("“When” needs a date written like 2026-10-31, not “tomorrow”.")
    expect(() => mapValues(garden, { When: "2026-13-45" })).toThrow("needs a date")
    expect(() => mapValues(garden, { Kind: "Chore" })).toThrow("“Kind” must be one of: Bug, Feature.")
    expect(() => mapValues(bugLog, { Hours: "lots" })).toThrow("“Hours” needs a number, not “lots”.")
    expect(() => mapValues(bugLog, { Hours: "" })).toThrow("needs a number")
  })

  it("accepts long text in a long text field, a real date, and ignores a calculation she tried to fill", () => {
    expect(mapValues(garden, { Story: "x".repeat(4000), When: "2026-10-31", Total: 5 })).toEqual({ "f-story": "x".repeat(4000), "f-when": "2026-10-31" })
  })

  it("refuses to log through the whole flow and says what is missing, so Mira can ask for it", async () => {
    api.fetchProjects.mockResolvedValue([structuredClone(garden)])
    api.fetchProject.mockResolvedValue(structuredClone(garden))

    const outcome = await runActions([act("create_entry", { project: "Garden", title: "Weeding", values: {} }, "Log an entry in “Garden”")])

    expect(api.createEntry).not.toHaveBeenCalled()
    expect(outcome.failed.error).toContain("needs Place, Kind and Labels")
    expect(outcomeNote(outcome)).toContain("✗ Log an entry in “Garden”: “Garden” needs Place, Kind and Labels")
  })

  it("updates an entry's title and time from built-in names, keeping its other values", async () => {
    api.fetchProjects.mockResolvedValue([structuredClone(garden)])
    api.updateEntry.mockResolvedValue({})
    api.fetchEntry.mockResolvedValue({ data: { "f-place": "Old" } })

    await runActions([act("update_entry", { entry: "p9/e1", values: { Title: "Renamed", Hours: 2, Place: "New" } })])

    expect(api.updateEntry).toHaveBeenCalledWith("p9", "e1", { title: "Renamed", time_spent: 120, data: { "f-place": "New" } })
  })
})

describe("a project Mira makes", () => {
  it("starts from the same default form as one made by hand when she names no fields", async () => {
    api.createProject.mockResolvedValue({ id: "n", name: "Weekly Planning" })

    await runActions([act("create_project", { name: "Weekly Planning" })])

    const schema = api.createProject.mock.calls[0][0].entry_schema
    expect(schema.map((field) => [field.name, field.type, field.required])).toEqual([["Description", "long_text", false], ["Date", "date", false]])
  })

  it("uses only the fields she names, and honours long text and optional fields", async () => {
    api.createProject.mockResolvedValue({ id: "n", name: "Garden" })

    await runActions([act("create_project", { name: "Garden", fields: [{ name: "Notes", type: "long_text", required: false }, { name: "Place" }] })])

    const schema = api.createProject.mock.calls[0][0].entry_schema
    expect(schema.map((field) => [field.name, field.type, field.required])).toEqual([["Notes", "long_text", false], ["Place", "text", undefined]])
  })
})

describe("a batch never crashes the chat", () => {
  it("reports each action's progress, and marks what was not run as skipped", async () => {
    api.createTask.mockResolvedValue({})
    const seen = []

    const outcome = await runActions(
      [act("create_task", { project: "Bug Log", title: "A" }), act("delete_task", { task: "bad" }), act("create_task", { project: "Bug Log", title: "C" })],
      { onProgress: (index, state, detail) => seen.push([index, state, detail]) }
    )

    expect(seen.map(([index, state]) => `${index}:${state}`)).toEqual(["0:running", "0:done", "1:running", "1:failed", "2:skipped"])
    expect(seen[1][2]).toContain("Added the task")
    expect(seen[3][2]).toContain("project-id/item-id")
    expect(outcome.skipped).toBe(1)
  })

  it("says so, instead of throwing, when the workspace cannot be read", async () => {
    api.fetchProjects.mockRejectedValue(new Error("offline"))
    const seen = []

    const outcome = await runActions([act("create_task", { project: "x", title: "A" }, "Add a task")], { onProgress: (i, state) => seen.push(state) })

    expect(outcome.failed).toMatchObject({ summary: "Add a task" })
    expect(outcome.failed.error).toContain("couldn't reach your workspace")
    expect(seen).toEqual(["failed"])
  })

  it("is not stopped by a progress display that throws", async () => {
    api.createTask.mockResolvedValue({})

    const outcome = await runActions([act("create_task", { project: "Bug Log", title: "A" })], { onProgress: () => { throw new Error("render") } })

    expect(outcome.failed).toBeNull()
    expect(outcome.done).toHaveLength(1)
  })
})

describe("dashboard panels", () => {
  it("adds a projects panel and a board panel after the existing ones", async () => {
    api.fetchDashboard.mockResolvedValue({ panels: [{ id: "old", type: "badges", config: {}, w: 1, h: 2 }], columns: 3 })
    api.updateDashboardPanels.mockResolvedValue({})

    await runActions([
      act("add_dashboard_panel", { kind: "projects" }),
      act("add_dashboard_panel", { kind: "board", project: "Bug Log", width: 2, height: 3 }),
    ])

    const [first, columns] = api.updateDashboardPanels.mock.calls[0]
    expect(columns).toBe(3)
    expect(first.map((panel) => panel.type)).toEqual(["badges", "projects"])
    expect(first[1].config).toEqual({})
    const [second] = api.updateDashboardPanels.mock.calls[1]
    expect(second.at(-1)).toMatchObject({ type: "board", config: { project_id: "p1", grouping: "__status__" }, w: 2, h: 3 })
  })
})

describe("activity times", () => {
  it("runs for an hour when only a start is given, and never ends before it starts", () => {
    expect(activityTimes("14:00")).toEqual({ start: "14:00", end: "15:00" })
    expect(activityTimes("14:00", "10:00")).toEqual({ start: "14:00", end: "15:00" })
    expect(activityTimes("23:30")).toEqual({ start: "23:30", end: "23:59" })
    expect(activityTimes("09:00", "11:30")).toEqual({ start: "09:00", end: "11:30" })
  })

  it("schedules '2pm today' and a time-less activity without a validation error", async () => {
    api.createCalendarActivity.mockResolvedValue({})

    const outcome = await runActions([
      act("create_activity", { title: "OS Fight", day: "2026-10-01", start_time: "14:00" }),
      act("create_activity", { title: "Review", day: "2026-10-01" }),
    ])

    expect(outcome.failed).toBeFalsy()
    expect(api.createCalendarActivity.mock.calls[0][0]).toMatchObject({ all_day: false, start_time: "14:00", end_time: "15:00" })
    expect(api.createCalendarActivity.mock.calls[1][0]).toMatchObject({ all_day: true, start_time: null, end_time: null })
  })
})
