/**
 * Reading a CSV file into a logbook.
 *
 * The file is turned into the same document the JSON import takes, so the server
 * does the restoring and the rules are the same ones: this module only has to read
 * rows and decide what they mean. It understands Chronicles' own CSV export and
 * ordinary spreadsheets alike:
 *
 *   - a few columns have a meaning: Kind (Entry or Task), Project, Title, Status,
 *     Due, Time spent (minutes) or Time spent ("2h 15m"), Captured, Notes;
 *   - every other column is a field of the project, typed as a number, a date or
 *     text from what it holds;
 *   - rows go to the project named in their Project column (or the file's name);
 *   - a project you already own with that name is added to, using the fields it
 *     already has, and never reshaped; anything else becomes a new project.
 *
 * Nothing here talks to the server, so the person can be shown what will happen
 * before anything is imported.
 */

import { TEXT_LIMITS } from "./fieldTypes"

const MAX_MINUTES = 10000 * 60
const DONE_WORDS = /done|complete|finished|shipped|closed|resolved/i
const KNOWN = {
  kind: ["kind"],
  project: ["project", "logbook"],
  title: ["title"],
  status: ["status"],
  due: ["due", "due date", "deadline"],
  minutes: ["time spent (minutes)", "minutes", "time spent minutes"],
  duration: ["time spent", "duration"],
  captured: ["captured", "captured at", "created", "created at"],
  notes: ["notes", "description"],
}

/** Rows of cells, from CSV text: quotes, doubled quotes, line breaks inside a cell, a leading BOM. */
export function parseCsv(text) {
  const source = String(text ?? "").replace(/^﻿/, "")
  const firstLine = source.split(/\r?\n/, 1)[0] || ""
  const delimiter = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ","
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1 } else quoted = false
      } else cell += char
    } else if (char === '"' && cell === "") quoted = true
    else if (char === delimiter) { row.push(cell); cell = "" }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += char
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""))
}

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field"
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`)

function whichKnown(header) {
  const name = header.trim().toLowerCase()
  return Object.keys(KNOWN).find((key) => KNOWN[key].includes(name)) || null
}

/** "2h 15m", "2h", "45m" or a bare number of minutes, as minutes; null when it isn't one. */
export function parseDuration(text) {
  const value = String(text ?? "").trim().toLowerCase()
  if (!value) return null
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value))
  const hours = /(\d+(?:\.\d+)?)\s*h/.exec(value)
  const minutes = /(\d+)\s*m(?!o)/.exec(value)
  if (!hours && !minutes) return null
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0))
}

function parseDue(text) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(text ?? "").trim())
  return match ? { date: match[1], time: match[2] || null } : null
}

function parseCaptured(text, fallback) {
  const value = String(text ?? "").trim()
  if (!value) return fallback
  const iso = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)
  if (!iso) return fallback
  const normal = value.replace(" ", "T")
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normal) ? normal : `${normal}${normal.includes("T") ? "" : "T00:00"}Z`
  const date = new Date(withZone)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function fieldType(values) {
  const filled = values.map((value) => value.trim()).filter(Boolean)
  if (filled.length && filled.every((value) => /^-?\d+(\.\d+)?$/.test(value))) return "number"
  if (filled.length && filled.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return "date"
  return filled.some((value) => value.length > TEXT_LIMITS.text) ? "long_text" : "text"
}

/** A cell as the value a field of this type holds, or undefined when it can't be. */
function valueFor(field, raw) {
  const text = raw.trim()
  if (text === "") return undefined
  if (field.type === "number") return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined
  if (field.type === "dropdown") return (field.options || []).find((option) => option.toLowerCase() === text.toLowerCase())
  if (field.type === "tags") return text.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 10).map((tag) => tag.slice(0, 30))
  if (field.type === "text") return text.slice(0, TEXT_LIMITS.text)
  if (field.type === "long_text") return text.slice(0, TEXT_LIMITS.long_text)
  return undefined
}

function checklistFrom(notes) {
  const items = []
  const plain = []
  for (const part of String(notes || "").split(/;\s*/)) {
    const match = /^\[( |x|X)\]\s*(.+)$/.exec(part.trim())
    if (match) items.push({ id: `chk-${items.length + 1}`, text: match[2].slice(0, 30), completed: match[1] !== " " })
    else if (part.trim()) plain.push(part.trim())
  }
  return { description: plain.join("; ") || null, checklist: items.slice(0, 20) }
}

function statusesFor(names) {
  const unique = [...new Set(names.filter(Boolean))].slice(0, 6)
  if (unique.length === 0) return []
  const list = unique.map((name) => ({ name: name.slice(0, 40), done: DONE_WORDS.test(name) }))
  // A project's statuses need at least one that means finished and one that doesn't.
  if (!list.some((status) => status.done)) list.push({ name: "Done", done: true })
  if (!list.some((status) => !status.done)) list.unshift({ name: "Still to do", done: false })
  return list
}

/**
 * The plan for a CSV file: the document to import and a plain account of it.
 *
 * `existingProjects` are the person's projects (as the API returns them), used to
 * add to a project that already has the name; pass none to make everything new.
 */
export function csvToDocument(text, { fileName = "Imported CSV", existingProjects = [], now = new Date() } = {}) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { document: null, summary: { projects: [], entries: 0, tasks: 0, warnings: [], problem: "That CSV has no rows to import. The first row must be the column headings." } }
  }

  const headers = rows[0].map((header) => header.trim())
  const roles = headers.map(whichKnown)
  const customColumns = headers.map((header, index) => ({ header, index })).filter(({ header, index }) => header && !roles[index])
  const at = (key) => roles.indexOf(key)
  const defaultProject = fileName.replace(/\.[^.]+$/, "").trim() || "Imported CSV"
  const nowIso = now.toISOString()
  const warnings = []

  // Group the rows by project, keeping the order they first appear in.
  const groups = new Map()
  for (const cells of rows.slice(1)) {
    const cell = (key) => (at(key) >= 0 ? (cells[at(key)] ?? "").trim() : "")
    const name = cell("project") || defaultProject
    if (!groups.has(name.toLowerCase())) groups.set(name.toLowerCase(), { name, rows: [] })
    groups.get(name.toLowerCase()).rows.push(cells)
  }

  const projects = []
  const plan = []
  let entryTotal = 0
  let taskTotal = 0
  let unreadable = 0

  for (const group of groups.values()) {
    const existing = existingProjects.find((project) => !project.shared && String(project.name).trim().toLowerCase() === group.name.toLowerCase())
    const cellOf = (cells, key) => (at(key) >= 0 ? (cells[at(key)] ?? "").trim() : "")

    // The fields: an existing project's own, or one new field per column that holds something.
    let schema
    let columns
    const skipped = []
    if (existing) {
      schema = existing.entry_schema || []
      columns = []
      for (const { header, index } of customColumns) {
        const field = schema.find((candidate) => candidate.name.trim().toLowerCase() === header.toLowerCase())
        const holds = group.rows.some((cells) => (cells[index] ?? "").trim() !== "")
        if (field && !["computed", "link", "project_reference", "checklist"].includes(field.type)) columns.push({ index, field })
        else if (holds) skipped.push(header)
      }
    } else {
      const used = new Set()
      columns = []
      schema = []
      for (const { header, index } of customColumns) {
        const values = group.rows.map((cells) => cells[index] ?? "")
        if (!values.some((value) => value.trim() !== "")) continue
        let id = `csv-${slug(header)}`
        while (used.has(id)) id += "-2"
        used.add(id)
        const field = { id, name: header.slice(0, 100), type: fieldType(values) }
        schema.push(field)
        columns.push({ index, field })
      }
    }

    const entryRows = group.rows.filter((cells) => !/^task$/i.test(cellOf(cells, "kind")))
    const taskRows = group.rows.filter((cells) => /^task$/i.test(cellOf(cells, "kind")))
    const knownStatuses = existing ? (existing.statuses?.length ? existing.statuses : [{ name: "Still to do", done: false }, { name: "Done", done: true }]) : statusesFor(entryRows.map((cells) => cellOf(cells, "status")))
    const statusList = knownStatuses

    const entries = entryRows.map((cells) => {
      const data = {}
      for (const { index, field } of columns) {
        const value = valueFor(field, cells[index] ?? "")
        if (value !== undefined) data[field.id] = value
      }
      // The same blanks the entry form fills in for a field with no value.
      for (const field of schema) {
        if (field.type === "tags" && data[field.id] === undefined) data[field.id] = []
        if (field.type === "checklist" && data[field.id] === undefined) data[field.id] = []
        if (field.type === "link" && data[field.id] === undefined) data[field.id] = ""
      }
      const statusText = cellOf(cells, "status")
      const known = statusList.find((status) => status.name.toLowerCase() === statusText.toLowerCase())
      const due = parseDue(cellOf(cells, "due"))
      if (cellOf(cells, "due") && !due) unreadable += 1
      let minutes = cellOf(cells, "minutes") ? parseDuration(cellOf(cells, "minutes")) : parseDuration(cellOf(cells, "duration"))
      if (minutes !== null && (minutes < 0 || minutes > MAX_MINUTES)) { minutes = null; unreadable += 1 }
      const firstText = Object.values(data).find((value) => typeof value === "string" && value.trim())
      return {
        id: newId(),
        title: (cellOf(cells, "title") || firstText || "Imported entry").slice(0, 255),
        data,
        retired_data: {},
        time_spent: minutes,
        created_at: parseCaptured(cellOf(cells, "captured"), nowIso),
        status: known ? known.name : null,
        todo: known ? !known.done : false,
        due_date: due ? due.date : null,
        due_time: due ? due.time : null,
      }
    })

    const tasks = taskRows.map((cells) => {
      const due = parseDue(cellOf(cells, "due"))
      if (cellOf(cells, "due") && !due) unreadable += 1
      const { description, checklist } = checklistFrom(cellOf(cells, "notes"))
      return {
        id: newId(),
        title: (cellOf(cells, "title") || "Imported task").slice(0, 255),
        description,
        due_date: due ? due.date : null,
        due_time: due ? due.time : null,
        completed: DONE_WORDS.test(cellOf(cells, "status")),
        checklist,
        created_at: parseCaptured(cellOf(cells, "captured"), nowIso),
      }
    })

    // A project you already have asks for a value in nearly every field, so say which rows can't be added.
    let unfit = 0
    const lacking = new Set()
    if (existing) {
      for (const entry of entries.filter((item) => !item.todo)) {
        const missing = schema.filter((field) => !["computed", "project_reference"].includes(field.type) && entry.data[field.id] === undefined)
        if (missing.length) { unfit += 1; missing.forEach((field) => lacking.add(field.name)) }
      }
    }
    entryTotal += entries.length
    taskTotal += tasks.length
    plan.push({ name: group.name, isNew: !existing, entries: entries.length, tasks: tasks.length, fields: schema.length, skippedColumns: skipped, unfit, lacking: [...lacking] })
    projects.push({
      id: existing ? existing.id : newId(),
      name: existing ? existing.name : group.name.slice(0, 255),
      description: existing ? existing.description || null : `Imported from ${fileName}.`,
      archived: false,
      entry_schema: schema,
      retired_schema: [],
      created_at: nowIso,
      statuses: existing ? existing.statuses || [] : statusList,
      entries,
      tasks,
    })
  }

  if (unreadable) warnings.push(`${unreadable} date or time value${unreadable === 1 ? "" : "s"} could not be read and ${unreadable === 1 ? "was" : "were"} left blank.`)
  for (const item of plan) {
    if (item.unfit) warnings.push(`In "${item.name}", ${item.unfit} ${item.unfit === 1 ? "entry has" : "entries have"} no value for ${item.lacking.join(", ")}, which that project needs, so ${item.unfit === 1 ? "it" : "they"} will be skipped and listed afterwards.`)
    if (item.skippedColumns.length) warnings.push(`In "${item.name}", ${item.skippedColumns.length === 1 ? "this column is" : "these columns are"} not fields of that project, so ${item.skippedColumns.length === 1 ? "it was" : "they were"} left out: ${item.skippedColumns.join(", ")}.`)
  }

  return {
    document: { format: "chronicles-export", version: 1, exported_at: nowIso, projects },
    summary: { projects: plan, entries: entryTotal, tasks: taskTotal, warnings, problem: null },
  }
}
