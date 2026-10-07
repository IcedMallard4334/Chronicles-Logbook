/**
 * Turning the export document into files people can open: CSV for a spreadsheet,
 * Markdown and HTML to read, plain text, a PDF, and the JSON backup itself.
 *
 * Everything starts from one tidy "report" built from the export document, so each
 * format says the same things: every project with its fields and statuses, every
 * entry with its title, status, deadline, time and values (named, not ids), and
 * every task with its checklist. Nothing here talks to the server.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const EXPORT_FORMATS = [
  { id: "json", label: "JSON", detail: "Full backup you can import again", extension: "json", type: "application/json" },
  { id: "csv", label: "CSV", detail: "Spreadsheet: every entry and task in rows", extension: "csv", type: "text/csv" },
  { id: "pdf", label: "PDF", detail: "A readable report to keep or print", extension: "pdf", type: "application/pdf" },
  { id: "md", label: "Markdown", detail: "Headings and tables, as simple text", extension: "md", type: "text/markdown" },
  { id: "html", label: "Web page", detail: "A styled page that opens in any browser", extension: "html", type: "text/html" },
  { id: "txt", label: "Plain text", detail: "Readable anywhere", extension: "txt", type: "text/plain" },
]

export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") return ""
  const total = Number(minutes)
  if (!Number.isFinite(total) || total <= 0) return total === 0 ? "0m" : ""
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

const day = (value) => (value ? String(value).slice(0, 10) : "")
const clock = (value) => (value ? String(value).slice(0, 5) : "")
const stamp = (value) => {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace("T", " ").slice(0, 16)
}

function describeValue(field, value, lookup) {
  if (value === null || value === undefined || value === "") return ""
  if (field?.type === "tags" || Array.isArray(value)) {
    return (Array.isArray(value) ? value : [value])
      .map((item) => (item && typeof item === "object" && "text" in item ? `${item.text}${item.completed ? " (done)" : ""}` : String(item)))
      .join(", ")
  }
  if (field?.type === "link") return lookup.entryTitles.get(value) || "(a linked entry)"
  if (field?.type === "project_reference") return lookup.projectNames.get(value) || "(a project)"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  const text = String(value)
  return UUID_PATTERN.test(text) ? lookup.entryTitles.get(text) || lookup.projectNames.get(text) || "(linked)" : text
}

/** The one shape every format is written from. */
export function buildReport(document, { generatedAt = new Date() } = {}) {
  const projects = document.projects || []
  const lookup = { projectNames: new Map(), entryTitles: new Map() }
  for (const project of projects) {
    lookup.projectNames.set(project.id, project.name)
    for (const entry of project.entries || []) {
      lookup.entryTitles.set(entry.id, entry.title || firstText(entry, project.entry_schema) || "an entry")
    }
  }

  const report = {
    generatedAt: generatedAt.toISOString(),
    exportedAt: document.exported_at || null,
    totals: { projects: projects.length, entries: 0, tasks: 0, minutes: 0 },
    projects: [],
  }

  for (const project of projects) {
    const fields = project.entry_schema || []
    const entries = (project.entries || []).map((entry) => ({
      id: entry.id,
      title: entry.title || firstText(entry, fields) || "Untitled entry",
      status: entry.status || (entry.todo ? "Still to do" : ""),
      outstanding: Boolean(entry.todo),
      due: [day(entry.due_date), clock(entry.due_time)].filter(Boolean).join(" "),
      minutes: entry.time_spent ?? null,
      captured: stamp(entry.created_at),
      values: fields.map((field) => ({
        name: field.name,
        type: field.type,
        text: describeValue(field, (entry.data || {})[field.id], lookup),
      })),
    }))
    const tasks = (project.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || "",
      done: Boolean(task.completed),
      due: [day(task.due_date), clock(task.due_time)].filter(Boolean).join(" "),
      created: stamp(task.created_at),
      checklist: (task.checklist || []).map((item) => ({ text: item.text, done: Boolean(item.completed) })),
    }))
    const minutes = entries.reduce((sum, entry) => sum + (entry.minutes || 0), 0)
    report.totals.entries += entries.length
    report.totals.tasks += tasks.length
    report.totals.minutes += minutes
    report.projects.push({
      id: project.id,
      name: project.name,
      description: project.description || "",
      archived: Boolean(project.archived),
      created: stamp(project.created_at),
      fields: fields.map((field) => ({
        name: field.name,
        type: field.type,
        detail: field.type === "dropdown" ? (field.options || []).join(" / ") : field.type === "computed" ? field.expression || "" : "",
      })),
      statuses: (project.statuses || []).map((status) => ({ name: status.name, done: Boolean(status.done) })),
      entries,
      tasks,
      minutes,
      openTasks: tasks.filter((task) => !task.done).length,
      outstanding: entries.filter((entry) => entry.outstanding).length,
    })
  }
  return report
}

function firstText(entry, fields) {
  for (const field of fields || []) {
    const value = (entry.data || {})[field.id]
    if (typeof value === "string" && value.trim() && !UUID_PATTERN.test(value.trim())) return value.trim().slice(0, 80)
  }
  return ""
}

// ── CSV ──────────────────────────────────────────────────────────────

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value)
  // A leading = + - @ would be run as a formula by a spreadsheet; a quote defuses it.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(report) {
  const fieldNames = []
  for (const project of report.projects) {
    for (const field of project.fields) if (!fieldNames.includes(field.name)) fieldNames.push(field.name)
  }
  const header = ["Kind", "Project", "Title", "Status", "Due", "Time spent (minutes)", "Time spent", "Captured", "Notes", ...fieldNames]
  const rows = [header]
  for (const project of report.projects) {
    for (const entry of project.entries) {
      const byName = new Map(entry.values.map((value) => [value.name, value.text]))
      rows.push([
        "Entry", project.name, entry.title, entry.status, entry.due, entry.minutes ?? "", formatMinutes(entry.minutes), entry.captured, "",
        ...fieldNames.map((name) => byName.get(name) ?? ""),
      ])
    }
    for (const task of project.tasks) {
      const notes = [task.description, ...task.checklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`)].filter(Boolean).join("; ")
      rows.push(["Task", project.name, task.title, task.done ? "Done" : "Open", task.due, "", "", task.created, notes, ...fieldNames.map(() => "")])
    }
  }
  // A byte-order mark so Excel reads the accents correctly.
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
}

// ── Markdown, text and HTML ──────────────────────────────────────────

const mdEscape = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")

function summaryLine(project) {
  return `${project.entries.length} ${project.entries.length === 1 ? "entry" : "entries"} · ${formatMinutes(project.minutes) || "no time logged"} · ${project.tasks.length} ${project.tasks.length === 1 ? "task" : "tasks"} (${project.openTasks} open)`
}

export function toMarkdown(report) {
  const lines = [
    "# Chronicles logbook",
    "",
    `Exported ${stamp(report.generatedAt)}. ${report.totals.projects} projects, ${report.totals.entries} entries, ${report.totals.tasks} tasks, ${formatMinutes(report.totals.minutes) || "no time"} logged.`,
    "",
  ]
  for (const project of report.projects) {
    lines.push(`## ${project.name}${project.archived ? " (archived)" : ""}`, "")
    if (project.description) lines.push(project.description, "")
    lines.push(`*${summaryLine(project)}. Created ${project.created}.*`, "")
    if (project.fields.length) {
      lines.push("**Fields:** " + project.fields.map((field) => `${field.name} (${field.type}${field.detail ? `: ${field.detail}` : ""})`).join(", "), "")
    }
    if (project.statuses.length) {
      lines.push("**Statuses:** " + project.statuses.map((status) => `${status.name}${status.done ? " ✓" : ""}`).join(" → "), "")
    }
    if (project.entries.length) {
      lines.push("### Entries", "")
      for (const entry of project.entries) {
        lines.push(`#### ${mdEscape(entry.title)}`, "")
        const facts = [
          ["Captured", entry.captured],
          ["Status", entry.status],
          ["Due", entry.due],
          ["Time spent", formatMinutes(entry.minutes)],
        ].filter(([, value]) => value)
        lines.push(facts.map(([name, value]) => `**${name}:** ${value}`).join(" · "), "")
        const filled = entry.values.filter((value) => value.text)
        if (filled.length) {
          lines.push("| Field | Value |", "| --- | --- |", ...filled.map((value) => `| ${mdEscape(value.name)} | ${mdEscape(value.text)} |`), "")
        }
      }
    }
    if (project.tasks.length) {
      lines.push("### Tasks", "")
      for (const task of project.tasks) {
        lines.push(`- [${task.done ? "x" : " "}] ${task.title}${task.due ? ` (due ${task.due})` : ""}`)
        if (task.description) lines.push(`  - ${task.description}`)
        for (const item of task.checklist) lines.push(`  - [${item.done ? "x" : " "}] ${item.text}`)
      }
      lines.push("")
    }
  }
  return lines.join("\n")
}

export function toPlainText(report) {
  const lines = [
    "CHRONICLES LOGBOOK",
    `Exported ${stamp(report.generatedAt)}. ${report.totals.projects} projects, ${report.totals.entries} entries, ${report.totals.tasks} tasks, ${formatMinutes(report.totals.minutes) || "no time"} logged.`,
    "",
  ]
  for (const project of report.projects) {
    lines.push("=".repeat(60), `${project.name}${project.archived ? " (archived)" : ""}`, "=".repeat(60))
    if (project.description) lines.push(project.description)
    lines.push(summaryLine(project) + `. Created ${project.created}.`)
    if (project.fields.length) lines.push("Fields: " + project.fields.map((field) => `${field.name} (${field.type})`).join(", "))
    if (project.statuses.length) lines.push("Statuses: " + project.statuses.map((status) => `${status.name}${status.done ? " (finished)" : ""}`).join(" > "))
    lines.push("")
    if (project.entries.length) lines.push("ENTRIES")
    for (const entry of project.entries) {
      lines.push(`- ${entry.title}`)
      const facts = [["Captured", entry.captured], ["Status", entry.status], ["Due", entry.due], ["Time spent", formatMinutes(entry.minutes)]].filter(([, value]) => value)
      if (facts.length) lines.push("    " + facts.map(([name, value]) => `${name}: ${value}`).join(" | "))
      for (const value of entry.values.filter((item) => item.text)) lines.push(`    ${value.name}: ${value.text}`)
    }
    if (project.tasks.length) lines.push("", "TASKS")
    for (const task of project.tasks) {
      lines.push(`- [${task.done ? "x" : " "}] ${task.title}${task.due ? ` (due ${task.due})` : ""}`)
      if (task.description) lines.push(`    ${task.description}`)
      for (const item of task.checklist) lines.push(`    [${item.done ? "x" : " "}] ${item.text}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

const html = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function toHtml(report) {
  const parts = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chronicles logbook</title>`,
    `<style>body{font:16px/1.55 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#1c1b2e}h1{margin-bottom:.2rem}h2{margin-top:2.5rem;border-bottom:2px solid #6b5bff;padding-bottom:.25rem}h3{margin:1.5rem 0 .4rem}.meta{color:#5b5a73;font-size:.9rem}.entry{border:1px solid #dcdaf0;border-radius:10px;padding:.8rem 1rem;margin:.7rem 0;break-inside:avoid}.entry h4{margin:0 0 .3rem}table{border-collapse:collapse;width:100%;font-size:.92rem}td,th{border-top:1px solid #ecebf7;padding:.25rem .5rem;text-align:left;vertical-align:top}th{width:32%;color:#5b5a73;font-weight:600}.pill{display:inline-block;background:#ecebff;color:#3a2fb5;border-radius:999px;padding:0 .6rem;font-size:.8rem;margin-right:.3rem}ul.tasks{list-style:none;padding:0}ul.tasks li{margin:.25rem 0}@media print{body{margin:0}}</style></head><body>`,
    `<h1>Chronicles logbook</h1><p class="meta">Exported ${html(stamp(report.generatedAt))} · ${report.totals.projects} projects · ${report.totals.entries} entries · ${report.totals.tasks} tasks · ${html(formatMinutes(report.totals.minutes) || "no time")} logged</p>`,
  ]
  for (const project of report.projects) {
    parts.push(`<h2>${html(project.name)}${project.archived ? " (archived)" : ""}</h2>`)
    if (project.description) parts.push(`<p>${html(project.description)}</p>`)
    parts.push(`<p class="meta">${html(summaryLine(project))}. Created ${html(project.created)}.</p>`)
    if (project.fields.length) parts.push(`<p><strong>Fields:</strong> ${project.fields.map((field) => `<span class="pill">${html(field.name)} · ${html(field.type)}</span>`).join("")}</p>`)
    if (project.statuses.length) parts.push(`<p><strong>Statuses:</strong> ${project.statuses.map((status) => `<span class="pill">${html(status.name)}${status.done ? " ✓" : ""}</span>`).join("")}</p>`)
    if (project.entries.length) parts.push("<h3>Entries</h3>")
    for (const entry of project.entries) {
      const facts = [["Captured", entry.captured], ["Status", entry.status], ["Due", entry.due], ["Time spent", formatMinutes(entry.minutes)]].filter(([, value]) => value)
      parts.push(`<div class="entry"><h4>${html(entry.title)}</h4><p class="meta">${facts.map(([name, value]) => `${html(name)}: ${html(value)}`).join(" · ")}</p>`)
      const filled = entry.values.filter((value) => value.text)
      if (filled.length) parts.push(`<table>${filled.map((value) => `<tr><th>${html(value.name)}</th><td>${html(value.text)}</td></tr>`).join("")}</table>`)
      parts.push("</div>")
    }
    if (project.tasks.length) {
      parts.push("<h3>Tasks</h3><ul class=\"tasks\">")
      for (const task of project.tasks) {
        parts.push(`<li>${task.done ? "☑" : "☐"} ${html(task.title)}${task.due ? ` <span class="meta">(due ${html(task.due)})</span>` : ""}`)
        if (task.description) parts.push(`<div class="meta">${html(task.description)}</div>`)
        if (task.checklist.length) parts.push(`<ul class="tasks">${task.checklist.map((item) => `<li>${item.done ? "☑" : "☐"} ${html(item.text)}</li>`).join("")}</ul>`)
        parts.push("</li>")
      }
      parts.push("</ul>")
    }
  }
  parts.push("</body></html>")
  return parts.join("")
}

// ── PDF ──────────────────────────────────────────────────────────────
// A small, dependency-free writer: Helvetica text on A4 pages, wrapped by an
// estimate of glyph width. Characters outside Latin-1 become "?" (the built-in
// fonts can't draw them); the other formats keep them exactly.

const PAGE = { width: 595, height: 842, margin: 50 }

function latin1(text) {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, ">")
    .replace(/[✓✔]/g, "(done)")
    .replace(/[☐]/g, "[ ]")
    .replace(/[☑]/g, "[x]")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
}

const pdfEscape = (text) => latin1(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")

function wrap(text, size, width) {
  const limit = Math.max(8, Math.floor(width / (size * 0.5)))
  const words = latin1(text).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ""
  for (let word of words) {
    while (word.length > limit) {
      if (current) { lines.push(current); current = "" }
      lines.push(word.slice(0, limit))
      word = word.slice(limit)
    }
    if (!current) current = word
    else if (current.length + 1 + word.length <= limit) current += ` ${word}`
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [""]
}

/** The report as the bytes of a PDF file. */
export function toPdf(report) {
  const pages = [[]]
  let y = PAGE.height - PAGE.margin
  const textWidth = PAGE.width - 2 * PAGE.margin

  const put = (text, { size = 10, bold = false, indent = 0, gap = 0, grey = false } = {}) => {
    const lineHeight = size * 1.4
    for (const line of wrap(text, size, textWidth - indent)) {
      if (y - lineHeight < PAGE.margin) {
        pages.push([])
        y = PAGE.height - PAGE.margin
      }
      y -= lineHeight
      pages[pages.length - 1].push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${grey ? "0.35 0.35 0.45" : "0 0 0"} rg ${PAGE.margin + indent} ${y.toFixed(1)} Td (${pdfEscape(line)}) Tj ET`)
    }
    y -= gap
  }

  put("Chronicles logbook", { size: 22, bold: true, gap: 4 })
  put(`Exported ${stamp(report.generatedAt)}. ${report.totals.projects} projects, ${report.totals.entries} entries, ${report.totals.tasks} tasks, ${formatMinutes(report.totals.minutes) || "no time"} logged.`, { grey: true, gap: 14 })

  for (const project of report.projects) {
    put(`${project.name}${project.archived ? " (archived)" : ""}`, { size: 16, bold: true, gap: 2 })
    if (project.description) put(project.description, { size: 10 })
    put(`${summaryLine(project)}. Created ${project.created}.`, { size: 9, grey: true, gap: 2 })
    if (project.fields.length) put("Fields: " + project.fields.map((field) => `${field.name} (${field.type})`).join(", "), { size: 9 })
    if (project.statuses.length) put("Statuses: " + project.statuses.map((status) => `${status.name}${status.done ? " (finished)" : ""}`).join(" > "), { size: 9, gap: 6 })
    if (project.entries.length) put("Entries", { size: 12, bold: true, gap: 2 })
    for (const entry of project.entries) {
      put(entry.title, { size: 10.5, bold: true })
      const facts = [["Captured", entry.captured], ["Status", entry.status], ["Due", entry.due], ["Time spent", formatMinutes(entry.minutes)]].filter(([, value]) => value)
      if (facts.length) put(facts.map(([name, value]) => `${name}: ${value}`).join("   "), { size: 9, grey: true, indent: 10 })
      for (const value of entry.values.filter((item) => item.text)) put(`${value.name}: ${value.text}`, { size: 9.5, indent: 10 })
      y -= 6
    }
    if (project.tasks.length) put("Tasks", { size: 12, bold: true, gap: 2 })
    for (const task of project.tasks) {
      put(`[${task.done ? "x" : " "}] ${task.title}${task.due ? ` (due ${task.due})` : ""}`, { size: 10 })
      if (task.description) put(task.description, { size: 9, grey: true, indent: 14 })
      for (const item of task.checklist) put(`[${item.done ? "x" : " "}] ${item.text}`, { size: 9, indent: 14 })
    }
    y -= 14
  }

  // Objects: 1 catalog, 2 pages, 3 and 4 fonts, then a (page, content) pair per page.
  const objects = []
  const pageIds = pages.map((_, index) => 5 + index * 2)
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  pages.forEach((commands, index) => {
    const stream = commands.join("\n")
    objects[5 + index * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`
    objects[6 + index * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  let out = "%PDF-1.4\n"
  const offsets = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`

  // Every character written above is Latin-1, so one byte each.
  const bytes = new Uint8Array(out.length)
  for (let index = 0; index < out.length; index += 1) bytes[index] = out.charCodeAt(index) & 0xff
  return bytes
}

/** The file for a format: its contents and name. */
export function buildExport(formatId, document, { generatedAt = new Date() } = {}) {
  const format = EXPORT_FORMATS.find((item) => item.id === formatId) || EXPORT_FORMATS[0]
  const date = generatedAt.toISOString().slice(0, 10)
  const filename = `chronicles-export-${date}.${format.extension}`
  if (format.id === "json") return { filename, type: format.type, contents: JSON.stringify(document, null, 2) }
  const report = buildReport(document, { generatedAt })
  const builders = { csv: toCsv, md: toMarkdown, html: toHtml, txt: toPlainText, pdf: toPdf }
  return { filename, type: format.type, contents: builders[format.id](report) }
}
