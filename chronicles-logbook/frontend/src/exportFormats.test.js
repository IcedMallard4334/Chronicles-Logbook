import { describe, expect, it } from "vitest"

import { EXPORT_FORMATS, buildExport, buildReport, formatMinutes, toCsv, toHtml, toMarkdown, toPdf, toPlainText } from "./exportFormats"

const LINK_TARGET = "11111111-2222-3333-4444-555555555555"

const document_ = {
  format: "chronicles-export",
  version: 1,
  exported_at: "2026-10-07T09:00:00Z",
  projects: [
    {
      id: "p1",
      name: "Operating Systems",
      description: "Labs and reading",
      archived: false,
      created_at: "2026-09-01T08:00:00Z",
      entry_schema: [
        { id: "f-topic", name: "Topic", type: "text" },
        { id: "f-tags", name: "Tags", type: "tags" },
        { id: "f-steps", name: "Steps", type: "checklist" },
        { id: "f-link", name: "Related", type: "link" },
        { id: "f-kind", name: "Kind", type: "dropdown", options: ["Lab", "Reading"] },
      ],
      statuses: [{ name: "Backlog", done: false }, { name: "Shipped", done: true }],
      entries: [
        {
          id: LINK_TARGET, title: "Lab 4", status: "Shipped", todo: false, due_date: "2026-10-05", due_time: "09:30:00", time_spent: 135,
          created_at: "2026-09-29T10:00:00Z",
          data: { "f-topic": "Scheduling, \"round robin\"", "f-tags": ["os", "lab"], "f-steps": [{ text: "Read", completed: true }, { text: "Code", completed: false }], "f-kind": "Lab" },
        },
        {
          id: "e2", title: null, status: null, todo: true, time_spent: null, created_at: "2026-09-30T10:00:00Z",
          data: { "f-topic": "=SUM(A1)", "f-link": LINK_TARGET },
        },
      ],
      tasks: [{ id: "t1", title: "Write up", description: "Two pages", completed: false, due_date: "2026-10-06", checklist: [{ text: "Outline", completed: true }], created_at: "2026-10-01T08:00:00Z" }],
    },
  ],
}

describe("the report", () => {
  it("totals the logbook and names everything, never an id", () => {
    const report = buildReport(document_, { generatedAt: new Date("2026-10-07T10:00:00Z") })

    expect(report.totals).toEqual({ projects: 1, entries: 2, tasks: 1, minutes: 135 })
    const [first, second] = report.projects[0].entries
    expect(first.title).toBe("Lab 4")
    expect(first.due).toBe("2026-10-05 09:30")
    expect(first.values.find((value) => value.name === "Tags").text).toBe("os, lab")
    expect(first.values.find((value) => value.name === "Steps").text).toBe("Read (done), Code")
    expect(second.title).toBe("=SUM(A1)")
    expect(second.values.find((value) => value.name === "Related").text).toBe("Lab 4")
    expect(second.status).toBe("Still to do")
    expect(report.projects[0].openTasks).toBe(1)
  })

  it("writes minutes the way a person says them", () => {
    expect(formatMinutes(135)).toBe("2h 15m")
    expect(formatMinutes(60)).toBe("1h")
    expect(formatMinutes(45)).toBe("45m")
    expect(formatMinutes(null)).toBe("")
  })
})

describe("the formats", () => {
  const report = buildReport(document_, { generatedAt: new Date("2026-10-07T10:00:00Z") })

  it("makes a CSV with entries and tasks as rows, quoting what needs it and defusing formulas", () => {
    const csv = toCsv(report)
    const lines = csv.replace("﻿", "").trim().split("\r\n")

    expect(lines[0]).toContain("Kind,Project,Title,Status,Due")
    expect(lines[0]).toContain("Topic")
    expect(lines[1]).toContain('"Scheduling, ""round robin"""')
    expect(lines[1]).toContain("2h 15m")
    expect(lines[2]).toContain("'=SUM(A1)")
    expect(lines[3].startsWith("Task,Operating Systems,Write up,Open")).toBe(true)
    expect(csv.startsWith("﻿")).toBe(true)
  })

  it("writes Markdown with headings, a field table and task checkboxes", () => {
    const md = toMarkdown(report)

    expect(md).toContain("## Operating Systems")
    expect(md).toContain("#### Lab 4")
    expect(md).toContain("| Topic | Scheduling, \"round robin\" |")
    expect(md).toContain("- [ ] Write up (due 2026-10-06)")
    expect(md).toContain("  - [x] Outline")
    expect(md).toContain("Backlog → Shipped ✓")
  })

  it("writes plain text and a standalone web page, escaping markup", () => {
    expect(toPlainText(report)).toContain("OPERATING SYSTEMS".slice(0, 0) + "Operating Systems")
    const page = toHtml({ ...report, projects: [{ ...report.projects[0], name: "<b>Risky</b>" }] })

    expect(page.startsWith("<!doctype html>")).toBe(true)
    expect(page).toContain("&lt;b&gt;Risky&lt;/b&gt;")
    expect(page).not.toContain("<b>Risky</b>")
  })

  it("writes a PDF with a correct structure", () => {
    const bytes = toPdf(report)
    const text = new TextDecoder("latin1").decode(bytes)

    expect(text.startsWith("%PDF-1.4")).toBe(true)
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true)
    expect(text).toContain("(Chronicles logbook) Tj")
    expect(text).toContain("(Lab 4) Tj")

    // The cross-reference table points at every object where it really starts.
    const startxref = Number(/startxref\n(\d+)/.exec(text)[1])
    expect(text.slice(startxref, startxref + 4)).toBe("xref")
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]))
    offsets.forEach((offset, index) => expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`))
  })

  it("starts a new page when the text runs long", () => {
    const many = { ...document_, projects: [{ ...document_.projects[0], entries: Array.from({ length: 120 }, (_, index) => ({ ...document_.projects[0].entries[0], id: `e${index}`, title: `Entry ${index}` })) }] }
    const text = new TextDecoder("latin1").decode(toPdf(buildReport(many)))

    expect(/\/Count (\d+)/.exec(text)[1]).not.toBe("1")
  })

  it("builds a named file for each format, JSON untouched", () => {
    const when = new Date("2026-10-07T10:00:00Z")

    for (const format of EXPORT_FORMATS) {
      const file = buildExport(format.id, document_, { generatedAt: when })
      expect(file.filename).toBe(`chronicles-export-2026-10-07.${format.extension}`)
      expect(file.type).toBe(format.type)
    }
    expect(JSON.parse(buildExport("json", document_).contents)).toEqual(document_)
  })
})
