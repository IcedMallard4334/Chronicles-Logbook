import { describe, expect, it } from "vitest"

import { csvToDocument, parseCsv, parseDuration } from "./csvImport"
import { buildReport, toCsv } from "./exportFormats"

const NOW = new Date("2026-10-08T10:00:00Z")

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, line breaks in a cell, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\r\n')

    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]])
  })

  it("reads semicolon files and skips blank rows", () => {
    expect(parseCsv("a;b\n\n1;2\n")).toEqual([["a", "b"], ["1", "2"]])
  })
})

describe("parseDuration", () => {
  it("reads minutes the way people write them", () => {
    expect(parseDuration("2h 15m")).toBe(135)
    expect(parseDuration("2h")).toBe(120)
    expect(parseDuration("45m")).toBe(45)
    expect(parseDuration("90")).toBe(90)
    expect(parseDuration("soon")).toBeNull()
    expect(parseDuration("")).toBeNull()
  })
})

describe("csvToDocument", () => {
  const csv = [
    "Kind,Project,Title,Status,Due,Time spent (minutes),Captured,Notes,Topic,Hours",
    'Entry,Operating Systems,Lab 4,Done,2026-10-05 09:30,135,2026-09-29 10:00,,"Scheduling, round robin",3',
    "Entry,Operating Systems,Lab 5,Still to do,,,2026-09-30 10:00,,Deadlocks,2",
    "Task,Operating Systems,Write up,Open,2026-10-06,,,Two pages; [x] Outline; [ ] Draft,,",
    "Entry,Gym,Legs,,,45,,,,",
  ].join("\n")

  it("makes a new project per Project value, with a field for each column that holds something", () => {
    const { document, summary } = csvToDocument(csv, { fileName: "export.csv", now: NOW })

    expect(document.projects.map((project) => project.name)).toEqual(["Operating Systems", "Gym"])
    const os = document.projects[0]
    expect(os.entry_schema.map((field) => [field.name, field.type])).toEqual([["Topic", "text"], ["Hours", "number"]])
    expect(os.entries).toHaveLength(2)
    expect(os.entries[0]).toMatchObject({
      title: "Lab 4", status: "Done", todo: false, due_date: "2026-10-05", due_time: "09:30", time_spent: 135,
      created_at: "2026-09-29T10:00:00.000Z",
    })
    expect(os.entries[0].data).toEqual({ "csv-topic": "Scheduling, round robin", "csv-hours": 3 })
    expect(os.entries[1]).toMatchObject({ status: "Still to do", todo: true })
    expect(os.statuses.map((status) => [status.name, status.done])).toEqual([["Done", true], ["Still to do", false]])
    expect(os.tasks[0]).toMatchObject({ title: "Write up", completed: false, due_date: "2026-10-06", description: "Two pages" })
    expect(os.tasks[0].checklist.map((item) => [item.text, item.completed])).toEqual([["Outline", true], ["Draft", false]])
    expect(document.projects[1].entry_schema).toEqual([])
    expect(summary).toMatchObject({ entries: 3, tasks: 1, problem: null })
    expect(summary.projects.map((project) => project.isNew)).toEqual([true, true])
  })

  it("names a file's rows after the file when there is no Project column", () => {
    const { document } = csvToDocument("Title,Mood\nA,happy\nB,calm", { fileName: "my diary.csv", now: NOW })

    expect(document.projects[0].name).toBe("my diary")
    expect(document.projects[0].entries.map((entry) => entry.title)).toEqual(["A", "B"])
    expect(document.projects[0].entry_schema.map((field) => field.name)).toEqual(["Mood"])
  })

  it("adds to a project you already own, using its fields and leaving its shape alone", () => {
    const existing = [{
      id: "p-os", name: "operating systems", description: "Labs", shared: false,
      statuses: [{ name: "Backlog", done: false }, { name: "Shipped", done: true }],
      entry_schema: [{ id: "f-topic", name: "Topic", type: "text" }, { id: "f-hours", name: "Hours", type: "number" }, { id: "f-kind", name: "Kind of work", type: "dropdown", options: ["Lab"] }],
    }]
    const { document, summary } = csvToDocument(
      "Project,Title,Status,Topic,Hours,Mood\nOperating Systems,Lab 4,Shipped,Scheduling,3,happy\nOperating Systems,Lab 5,Nonsense,Deadlocks,x,calm",
      { fileName: "e.csv", existingProjects: existing, now: NOW }
    )

    const project = document.projects[0]
    expect(project.id).toBe("p-os")
    expect(project.entry_schema).toEqual(existing[0].entry_schema)
    expect(project.entries[0]).toMatchObject({ status: "Shipped", todo: false, data: { "f-topic": "Scheduling", "f-hours": 3 } })
    // A status the project doesn't have is dropped, and a number that isn't one is left blank.
    expect(project.entries[1]).toMatchObject({ status: null, data: { "f-topic": "Deadlocks" } })
    expect(summary.projects[0]).toMatchObject({ isNew: false, skippedColumns: ["Mood"] })
    expect(summary.warnings.join(" ")).toContain("Mood")
  })

  it("warns about rows a project you already have would refuse", () => {
    const existing = [{ id: "p1", name: "Gym", shared: false, statuses: [], entry_schema: [{ id: "f-reps", name: "Reps", type: "number" }, { id: "f-tags", name: "Tags", type: "tags" }] }]

    const { summary } = csvToDocument("Project,Title,Reps\nGym,Squats,10\nGym,Rest day,", { existingProjects: existing, now: NOW })

    expect(summary.projects[0]).toMatchObject({ unfit: 1, lacking: ["Reps"] })
    expect(summary.warnings.join(" ")).toMatch(/1 entry has no value for Reps.*skipped/)
  })

  it("does not hold planned work to a project's required fields", () => {
    const existing = [{ id: "p1", name: "Gym", shared: false, statuses: [], entry_schema: [{ id: "f-reps", name: "Reps", type: "number" }] }]

    const { summary } = csvToDocument("Project,Title,Status,Reps\nGym,Squats,Still to do,\nGym,Lunges,Done,", { existingProjects: existing, now: NOW })

    // The planned one may be empty; the finished one may not.
    expect(summary.projects[0]).toMatchObject({ unfit: 1, lacking: ["Reps"] })
  })

  it("does not add to a project somebody else shared", () => {
    const shared = [{ id: "p-shared", name: "Gym", shared: true, entry_schema: [] }]

    const { document, summary } = csvToDocument("Project,Title\nGym,Legs", { existingProjects: shared, now: NOW })

    expect(document.projects[0].id).not.toBe("p-shared")
    expect(summary.projects[0].isNew).toBe(true)
  })

  it("leaves unreadable dates and impossible times blank, and says so", () => {
    const { document, summary } = csvToDocument("Title,Due,Time spent (minutes)\nA,next week,5\nB,2026-10-01,9999999", { now: NOW })

    expect(document.projects[0].entries.map((entry) => [entry.due_date, entry.time_spent])).toEqual([[null, 5], ["2026-10-01", null]])
    expect(summary.warnings.join(" ")).toContain("2 date or time values could not be read")
  })

  it("explains a file with nothing in it", () => {
    expect(csvToDocument("Title\n", { now: NOW }).summary.problem).toMatch(/no rows to import/)
    expect(csvToDocument("", { now: NOW }).document).toBeNull()
  })

  it("reads Chronicles' own CSV export back in", () => {
    const exported = buildReport({
      projects: [{
        id: "p1", name: "Operating Systems", created_at: "2026-09-01T08:00:00Z",
        entry_schema: [{ id: "f-topic", name: "Topic", type: "text" }, { id: "f-hours", name: "Hours", type: "number" }],
        statuses: [{ name: "Backlog", done: false }, { name: "Shipped", done: true }],
        entries: [{ id: "e1", title: "Lab 4", status: "Shipped", todo: false, due_date: "2026-10-05", due_time: "09:30:00", time_spent: 135, created_at: "2026-09-29T10:00:00Z", data: { "f-topic": "Scheduling", "f-hours": 3 } }],
        tasks: [{ id: "t1", title: "Write up", completed: true, due_date: "2026-10-06", checklist: [{ text: "Outline", completed: true }], created_at: "2026-10-01T08:00:00Z" }],
      }],
    }, { generatedAt: NOW })

    const { document, summary } = csvToDocument(toCsv(exported), { fileName: "chronicles-export.csv", now: NOW })

    const project = document.projects[0]
    expect(project.name).toBe("Operating Systems")
    expect(project.entries[0]).toMatchObject({ title: "Lab 4", status: "Shipped", time_spent: 135, due_date: "2026-10-05", due_time: "09:30" })
    expect(project.entries[0].data).toEqual({ "csv-topic": "Scheduling", "csv-hours": 3 })
    expect(project.tasks[0]).toMatchObject({ title: "Write up", completed: true, due_date: "2026-10-06" })
    expect(project.tasks[0].checklist[0]).toMatchObject({ text: "Outline", completed: true })
    expect(summary).toMatchObject({ entries: 1, tasks: 1 })
  })
})
