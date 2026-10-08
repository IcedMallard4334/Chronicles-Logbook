import {
  archiveProject,
  createCalendarActivity,
  createCustomStatistic,
  createEntry,
  createProject,
  createRule,
  createTask,
  deleteCalendarActivity,
  deleteEntry,
  deleteProject,
  deleteTask,
  fetchCalendarActivities,
  fetchDashboard,
  fetchEntry,
  fetchProject,
  fetchProjects,
  fetchTasks,
  setRecurrence,
  shareProject,
  stopRecurrence,
  toggleTask,
  unarchiveProject,
  updateCalendarActivity,
  updateEntry,
  updateProject,
  updateSchema,
  updateDashboardPanels,
  updateTask,
} from "./api"
import { TEXT_LIMITS } from "./fieldTypes"
import { defaultSchemaFields } from "./formFields"
import { applyPreferences, readPreference } from "./preferences"
import { projectStatuses } from "./statuses"

// What Mira proposes runs here, only after the person confirms, through the same
// authenticated calls a manual action uses. Every action resolves the names it
// was given against what exists *now*, so a project created earlier in the same
// batch can be used by the next action.

const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`

const same = (a, b) => String(a).trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase()

export function findProject(reference, projects) {
  const byId = projects.find((project) => project.id === reference)
  if (byId) return byId
  const matches = projects.filter((project) => same(project.name, reference))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`More than one project is called “${reference}”. Use its id.`)
  const partial = projects.filter((project) => String(project.name).toLocaleLowerCase().includes(String(reference).trim().toLocaleLowerCase()))
  if (partial.length === 1) return partial[0]
  throw new Error(`I couldn't find a project called “${reference}”.`)
}

export function findField(project, reference) {
  const fields = project.entry_schema || []
  const field = fields.find((item) => item.id === reference) || fields.find((item) => same(item.name, reference))
  if (!field) throw new Error(`“${project.name}” has no field called “${reference}”.`)
  return field
}

/** Turns {Field name} in an expression into {field-id}. */
export function resolveExpression(expression, fields) {
  return expression.replace(/\{([^}]+)\}/g, (match, label) => {
    const field = fields.find((item) => item.id === label || same(item.name, label))
    if (!field) throw new Error(`The expression uses “${label}”, which isn't a field here.`)
    return `{${field.id}}`
  })
}

export function buildField(spec, existing = []) {
  const field = { id: newId(), name: spec.name.trim(), type: spec.type || "text" }
  // Required is the default, so only a field that is not required says so.
  if (spec.required === false) field.required = false
  if (field.type === "dropdown") {
    if (!spec.options?.length) throw new Error(`The dropdown “${field.name}” needs at least one option.`)
    field.options = spec.options
  }
  if (field.type === "computed") {
    if (!spec.expression) throw new Error(`The calculation “${field.name}” needs an expression.`)
    field.expression = resolveExpression(spec.expression, existing)
  }
  return field
}

function buildSchema(specs = []) {
  const fields = []
  for (const spec of specs) fields.push(buildField(spec, fields))
  return fields
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
const NOT_ASKED_FOR = new Set(["computed", "project_reference"])
const thousands = (count) => count.toLocaleString("en")

/**
 * Every entry has a title and a time of its own, so a value Mira keyed "Title", "Hours" or "Minutes"
 * belongs to those, not to a field of the project, unless the project has a field of that name.
 */
export function takeBuiltIns(project, values = {}) {
  const own = new Set((project.entry_schema || []).map((field) => String(field.name).trim().toLocaleLowerCase()))
  const built = {}
  const rest = {}
  for (const [label, raw] of Object.entries(values)) {
    const key = String(label).trim().toLocaleLowerCase()
    if (!own.has(key) && key === "title") built.title = String(raw).trim()
    else if (!own.has(key) && (key === "hours" || key === "hours spent")) built.hours = Number(raw)
    else if (!own.has(key) && (key === "minutes" || key === "minutes spent")) built.minutes = Number(raw)
    else rest[label] = raw
  }
  return { built, rest }
}

/**
 * {Field name: value} becomes {field-id: value}, coercing what the field type expects and saying,
 * in the field's own words, what is wrong with a value instead of leaving it to be refused later.
 */
export function mapValues(project, values = {}) {
  const data = {}
  for (const [label, raw] of Object.entries(values)) {
    const field = findField(project, label)
    if (NOT_ASKED_FOR.has(field.type)) continue
    let value = raw
    if (field.type === "number") {
      value = Number(raw)
      if (raw === "" || raw === null || !Number.isFinite(value)) throw new Error(`“${field.name}” needs a number, not “${raw}”.`)
    } else if (field.type === "text" || field.type === "long_text") {
      value = String(raw)
      const limit = TEXT_LIMITS[field.type]
      if (value.length > limit) {
        throw new Error(`“${field.name}” can hold at most ${thousands(limit)} characters, and this is ${thousands(value.length)}.`)
      }
    } else if (field.type === "date") {
      value = String(raw).trim()
      if (!DATE_SHAPE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw new Error(`“${field.name}” needs a date written like 2026-10-31, not “${raw}”.`)
      }
    } else if (field.type === "dropdown") {
      const choice = (field.options || []).find((option) => same(option, raw))
      if (choice === undefined) throw new Error(`“${field.name}” must be one of: ${(field.options || []).join(", ")}.`)
      value = choice
    } else if (field.type === "tags") {
      value = (Array.isArray(raw) ? raw : String(raw).split(",")).map((tag) => String(tag).trim()).filter(Boolean)
    } else if (field.type === "checklist") {
      value = (Array.isArray(raw) ? raw : [raw]).map((item) => ({ id: newId(), text: String(item.text ?? item), completed: Boolean(item.completed) }))
    }
    data[field.id] = value
  }
  return data
}

const isFinishedStatus = (project, name) => {
  const status = projectStatuses(project).find((item) => same(item.name, name))
  return status ? Boolean(status.done) : true
}

/** The names of the required fields a finished entry has not been given a value for. */
export function missingRequiredFields(project, data, { todo, status } = {}) {
  if (todo === true || (status && !isFinishedStatus(project, status))) return []
  return (project.entry_schema || [])
    .filter((field) => field.required !== false && !NOT_ASKED_FOR.has(field.type) && field.type !== "link" && field.type !== "checklist")
    .filter((field) => {
      const value = data[field.id]
      return value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0)
    })
    .map((field) => field.name)
}

const listOf = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)

/**
 * What Mira proposed for an entry, made ready to send: the project's values by field id, the title
 * and time from wherever she put them, and a plain refusal (naming exactly what is missing) when a
 * finished entry could not be saved.
 */
export function prepareEntry(project, p) {
  const { built, rest } = takeBuiltIns(project, p.values)
  const extras = entryExtras({
    ...p,
    title: p.title ?? built.title,
    ...(p.time_spent_minutes === undefined && (Number.isFinite(built.hours) || Number.isFinite(built.minutes))
      ? { time_spent_minutes: (Number.isFinite(built.hours) ? built.hours : 0) * 60 + (Number.isFinite(built.minutes) ? built.minutes : 0) }
      : {}),
  })
  if (!String(extras.title ?? "").trim()) throw new Error("This entry needs a title.")
  const data = mapValues(project, rest)
  // The form sends these two empty when they are left alone; so does Mira.
  for (const field of project.entry_schema || []) {
    if (field.type === "checklist" && data[field.id] === undefined) data[field.id] = []
    if (field.type === "link" && data[field.id] === undefined) data[field.id] = ""
  }
  const missing = missingRequiredFields(project, data, { todo: p.todo, status: p.status })
  if (missing.length) {
    throw new Error(`“${project.name}” needs ${listOf(missing)} before this entry can be logged. Those fields are required.`)
  }
  return { data, extras }
}

const splitRef = (reference) => {
  const [projectId, itemId] = String(reference).split("/")
  if (!projectId || !itemId) throw new Error("I need the project and item together (project-id/item-id).")
  return [projectId, itemId]
}

const entryExtras = (p) => ({
  ...(p.title !== undefined ? { title: p.title } : {}),
  ...(p.time_spent_minutes !== undefined ? { time_spent: p.time_spent_minutes || null } : {}),
  ...(p.todo !== undefined ? { todo: p.todo } : {}),
  ...(p.status !== undefined ? { status: p.status } : {}),
  ...(p.due_date !== undefined ? { due_date: p.due_date } : {}),
  ...(p.due_time !== undefined ? { due_time: p.due_time } : {}),
})

const PAGE_VIEWS = {
  home: "home", today: "today", outstanding: "outstanding", activities: "activities", entries: "entries",
  tasks: "tasks", board: "board", calendar: "calendar", statistics: "statistics", assistant: "assistant",
}

async function currentProject(reference, workspace) {
  const found = findProject(reference, workspace.projects)
  // Re-read it: an earlier action in the same batch may have changed its schema.
  const fresh = await Promise.resolve().then(() => fetchProject(found.id)).catch(() => found)
  Object.assign(found, fresh)
  return found
}

const minutesOf = (clock) => {
  const [hours, minutes] = String(clock).split(":").map(Number)
  return hours * 60 + (minutes || 0)
}
const clockOf = (total) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`

/** A start and an end that are valid together: the end is always after the start, on the same day. */
export function activityTimes(startTime, endTime) {
  const startMinutes = startTime ? minutesOf(startTime) : endTime ? Math.max(minutesOf(endTime) - 60, 0) : 9 * 60
  const start = Math.min(startMinutes, 23 * 60 + 58)
  const end = endTime && minutesOf(endTime) > start ? minutesOf(endTime) : Math.min(start + 60, 23 * 60 + 59)
  return { start: clockOf(start), end: clockOf(end) }
}

const HANDLERS = {
  async create_project(p, workspace) {
    if (workspace.projects.some((project) => same(project.name, p.name))) {
      throw new Error(`A project called “${p.name}” already exists.`)
    }
    const created = await createProject({
      name: p.name,
      description: p.description || null,
      // No fields named: it starts from the same default form as one made by hand.
      entry_schema: p.fields?.length ? buildSchema(p.fields) : defaultSchemaFields(newId),
      ...(p.statuses?.length ? { statuses: p.statuses } : {}),
    })
    workspace.projects.push(created)
    return `Created project “${created.name}”`
  },
  async update_project(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const updated = await updateProject(project.id, {
      ...(p.name ? { name: p.name } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
    })
    Object.assign(project, updated)
    return `Updated project “${updated.name}”`
  },
  async set_statuses(p, workspace) {
    const project = await currentProject(p.project, workspace)
    Object.assign(project, await updateProject(project.id, { statuses: p.statuses }))
    return `Set the statuses of “${project.name}”`
  },
  async archive_project(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const archive = p.archive !== false
    Object.assign(project, archive ? await archiveProject(project.id) : await unarchiveProject(project.id))
    return `${archive ? "Archived" : "Unarchived"} project “${project.name}”`
  },
  async delete_project(p, workspace) {
    const project = findProject(p.project, workspace.projects)
    await deleteProject(project.id)
    workspace.projects.splice(workspace.projects.indexOf(project), 1)
    return `Deleted project “${project.name}”`
  },
  async add_field(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const schema = [...(project.entry_schema || [])]
    schema.push(buildField(p.field, schema))
    Object.assign(project, await updateSchema(project.id, schema))
    return `Added the field “${p.field.name}” to “${project.name}”`
  },
  async rename_field(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const target = findField(project, p.field)
    const schema = project.entry_schema.map((field) => (field.id === target.id ? { ...field, name: p.new_name } : field))
    Object.assign(project, await updateSchema(project.id, schema))
    return `Renamed “${target.name}” to “${p.new_name}” in “${project.name}”`
  },
  async remove_field(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const target = findField(project, p.field)
    const schema = project.entry_schema.filter((field) => field.id !== target.id)
    Object.assign(project, await updateSchema(project.id, schema))
    return `Removed the field “${target.name}” from “${project.name}”`
  },
  async create_entry(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const { data, extras } = prepareEntry(project, p)
    await createEntry(project.id, { data, ...extras })
    return `Logged “${extras.title}” in “${project.name}”`
  },
  async update_entry(p, workspace) {
    const [projectId, entryId] = splitRef(p.entry)
    const project = findProject(projectId, workspace.projects)
    const { built, rest } = takeBuiltIns(project, p.values)
    const patch = entryExtras({
      ...p,
      title: p.title ?? built.title,
      ...(p.time_spent_minutes === undefined && (Number.isFinite(built.hours) || Number.isFinite(built.minutes))
        ? { time_spent_minutes: (Number.isFinite(built.hours) ? built.hours : 0) * 60 + (Number.isFinite(built.minutes) ? built.minutes : 0) }
        : {}),
    })
    if (Object.keys(rest).length) {
      const entry = await fetchEntry(projectId, entryId)
      patch.data = { ...(entry.data || {}), ...mapValues(project, rest) }
    }
    await updateEntry(projectId, entryId, patch)
    return "Updated an entry"
  },
  async delete_entry(p) {
    const [projectId, entryId] = splitRef(p.entry)
    await deleteEntry(projectId, entryId)
    return "Deleted an entry"
  },
  async create_task(p, workspace) {
    const project = await currentProject(p.project, workspace)
    await createTask(project.id, {
      title: p.title,
      ...(p.description ? { description: p.description } : {}),
      ...(p.due_date ? { due_date: p.due_date } : {}),
      ...(p.due_date && p.due_time ? { due_time: p.due_time } : {}),
      checklist: (p.checklist || []).map((text) => ({ id: newId(), text, completed: false })),
    })
    return `Added the task “${p.title}” to “${project.name}”`
  },
  async update_task(p) {
    const [projectId, taskId] = splitRef(p.task)
    await updateTask(projectId, taskId, {
      ...(p.title ? { title: p.title } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.due_date ? { due_date: p.due_date } : {}),
      ...(p.due_time !== undefined ? { due_time: p.due_time || null } : {}),
    })
    return "Updated a task"
  },
  async complete_task(p) {
    const [projectId, taskId] = splitRef(p.task)
    const wanted = p.completed !== false
    const task = (await fetchTasks(projectId)).find((item) => item.id === taskId)
    if (!task) throw new Error("I couldn't find that task any more.")
    if (task.completed !== wanted) await toggleTask(projectId, taskId)
    return wanted ? `Marked “${task.title}” done` : `Reopened “${task.title}”`
  },
  async delete_task(p) {
    const [projectId, taskId] = splitRef(p.task)
    await deleteTask(projectId, taskId)
    return "Deleted a task"
  },
  async create_activity(p) {
    // Said with no time at all, it is an all-day item; said with a start only
    // ("at 2pm"), it runs for an hour. An end that isn't after the start is
    // replaced the same way, so a slip in the times never costs the whole action.
    const allDay = Boolean(p.all_day) || (!p.start_time && !p.end_time)
    const { start, end } = allDay ? { start: null, end: null } : activityTimes(p.start_time, p.end_time)
    await createCalendarActivity({
      title: p.title,
      description: p.description || "",
      day: p.day,
      all_day: allDay,
      start_time: start,
      end_time: end,
    })
    return `Scheduled “${p.title}” on ${p.day}${allDay ? "" : ` at ${start}`}`
  },
  async update_activity(p) {
    const today = new Date()
    const key = (offset) => {
      const date = new Date(today)
      date.setDate(date.getDate() + offset)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    }
    const found = (await fetchCalendarActivities({ start: key(-60), end: key(120) })).find((item) => item.id === p.activity)
    if (!found) throw new Error("I couldn't find that activity any more.")
    const merged = { ...found, ...Object.fromEntries(Object.entries(p).filter(([name]) => name !== "activity")) }
    if (merged.all_day) { merged.start_time = null; merged.end_time = null }
    const { id: _id, ...body } = merged
    await updateCalendarActivity(p.activity, body)
    return `Updated “${merged.title}”`
  },
  async delete_activity(p) {
    await deleteCalendarActivity(p.activity)
    return "Deleted a scheduled activity"
  },
  async set_reminder(p) {
    const [projectId, itemId] = splitRef(p.target)
    if (p.kind === "task") {
      await updateTask(projectId, itemId, { due_date: p.due_date, due_time: p.due_time || null })
    } else {
      await updateEntry(projectId, itemId, { todo: true, due_date: p.due_date, due_time: p.due_time || null })
    }
    return `Set a reminder for ${p.due_date}${p.due_time ? ` at ${p.due_time}` : ""}`
  },
  async set_recurrence(p) {
    const [projectId, entryId] = splitRef(p.entry)
    await setRecurrence(projectId, entryId, {
      frequency: p.frequency,
      interval: p.interval || 1,
      ...(p.ends_on ? { ends_on: p.ends_on } : {}),
    })
    return `Made the entry repeat ${p.frequency}`
  },
  async stop_recurrence(p) {
    const [projectId, entryId] = splitRef(p.entry)
    await stopRecurrence(projectId, entryId)
    return "Stopped the entry repeating"
  },
  async create_rule(p, workspace) {
    const project = await currentProject(p.project, workspace)
    const conditions = (p.conditions || []).map((condition) => ({
      field_id: findField(project, condition.field).id,
      operator: condition.operator || "equals",
      value: condition.value ?? null,
    }))
    const actions = p.actions.map((action) => {
      if (action.type === "mark_todo") return { type: "mark_todo", due_in_days: action.due_in_days ?? null }
      const fieldId = findField(project, action.field).id
      if (action.type === "add_tags") return { type: "add_tags", field_id: fieldId, tags: action.tags || [] }
      return { type: "set_field", field_id: fieldId, value: action.value ?? "" , overwrite: false }
    })
    await createRule(project.id, { name: p.name, enabled: true, match: p.match || "all", conditions, actions })
    return `Created the rule “${p.name}” in “${project.name}”`
  },
  async share_project(p, workspace) {
    const project = await currentProject(p.project, workspace)
    await shareProject(project.id, p.email)
    return `Invited ${p.email} to “${project.name}”`
  },
  async create_statistic(p, workspace) {
    const project = await currentProject(p.project, workspace)
    await createCustomStatistic({
      project_id: project.id,
      name: p.name,
      expression: resolveExpression(p.expression, project.entry_schema || []),
    })
    return `Saved the statistic “${p.name}”`
  },
  async open_page(p, workspace) {
    workspace.navigate?.(p.page)
    return `Opened ${p.page}`
  },
  async add_dashboard_panel(p, workspace) {
    const project = p.project ? await currentProject(p.project, workspace) : null
    const config = {
      projects: project ? { project_id: project.id } : {},
      badges: {},
      board: { project_id: project?.id, grouping: "__status__" },
      statistic: { view: p.view || "overview" },
    }[p.kind]
    const current = await fetchDashboard()
    const panel = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `panel-${Date.now()}`,
      type: p.kind,
      config,
      w: p.width || 1,
      h: p.height || 2,
    }
    await updateDashboardPanels([...(current.panels || []), panel], current.columns)
    return `Added ${{ projects: project ? `“${project.name}”` : "your projects", badges: "your unlocked badges", board: `the board for “${project?.name}”`, statistic: "a statistic" }[p.kind]} to your dashboard`
  },
  async set_theme(p) {
    window.localStorage.setItem("chronicles-theme", p.theme)
    applyPreferences({
      theme: p.theme,
      accent: readPreference("accent", "chronicles"),
      density: readPreference("density", "comfortable"),
    })
    return `Switched to the ${p.theme} theme`
  },
}

export const SUPPORTED_ACTIONS = Object.keys(HANDLERS)

export function pageToView(page) {
  return PAGE_VIEWS[page] || null
}

/**
 * Runs actions in order, reporting each one's progress through `onProgress(index, state, detail)`
 * (state is "running", "done", "failed" or "skipped"). It stops at the first one that fails, since
 * the later ones may depend on it, and it never throws: a problem is an outcome, not a crash.
 */
export async function runActions(actions, { navigate, onProgress } = {}) {
  const done = []
  const report = (index, state, detail) => {
    try {
      onProgress?.(index, state, detail)
    } catch {
      // A display problem must never stop the work.
    }
  }
  const stopAt = (index, error, summary) => {
    const reason = error instanceof Error && error.message ? error.message : "Something went wrong."
    report(index, "failed", reason)
    for (let later = index + 1; later < actions.length; later += 1) report(later, "skipped")
    return { done, failed: { summary: summary || actions[index]?.summary || actions[index]?.type, error: reason }, skipped: actions.length - index - 1 }
  }

  let workspace
  try {
    workspace = { projects: await fetchProjects(), navigate }
  } catch {
    return stopAt(0, new Error("I couldn't reach your workspace just now. Check your connection and try again."))
  }

  for (const [index, action] of actions.entries()) {
    const handler = HANDLERS[action.type]
    report(index, "running")
    try {
      if (!handler) throw new Error("Mira can't do that yet.")
      const line = await handler(action.payload || {}, workspace)
      done.push(line)
      report(index, "done", line)
    } catch (error) {
      return stopAt(index, error)
    }
  }
  return { done, failed: null, skipped: 0 }
}

/**
 * How a batch went, in words Mira can read: what worked, what didn't and why. It is sent back to her
 * so she can put a failure right or ask for exactly what is missing.
 */
export function outcomeNote(outcome) {
  const lines = outcome.done.map((line) => `- ✓ ${line}`)
  if (outcome.failed) {
    // The server's wording, without its technical prefix.
    const reason = String(outcome.failed.error).replace(/^(Value error|Assertion error),?\s*/i, "")
    lines.push(`- ✗ ${outcome.failed.summary}: ${reason}`)
    if (outcome.skipped) lines.push(`- ${outcome.skipped} more ${outcome.skipped === 1 ? "action was" : "actions were"} not run.`)
  }
  return lines.join("\n").slice(0, 1900)
}
