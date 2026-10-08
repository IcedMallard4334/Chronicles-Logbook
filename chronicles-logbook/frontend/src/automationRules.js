/**
 * Plain helpers for entry rules and recurrence (US-3.12).
 *
 * Kept out of the components so the wording a person reads ("When Kind is
 * Bug, add tag triage") and the decisions the entry form makes ("a rule can
 * fill this, so it may be left blank") are each written once and tested
 * directly.
 */

import { searchOperatorsFor } from "./fieldTypes"

// What a rule may fill in. Mirrors SETTABLE_TYPES in backend/app/automation.py:
// computed fields are derived by the server, and links, references, tags and
// checklists have rules of their own about what a valid value is.
export const SETTABLE_FIELD_TYPES = ["text", "long_text", "number", "date", "dropdown"]

export const ACTION_TYPES = [
  { value: "add_tags", label: "Add tags" },
  { value: "set_field", label: "Fill in a field" },
  { value: "mark_todo", label: "Mark as to-do" },
  { value: "set_status", label: "Move it to a status" },
  { value: "create_task", label: "Add a follow-up task" },
  { value: "repeat", label: "Make it repeat" },
]

// A rule waits for one of two moments. The second can only follow up with a
// task or a repeat: the entry's own values stay exactly as they were just saved.
export const TRIGGERS = [
  { value: "created", label: "a new entry is logged" },
  { value: "status", label: "an entry moves to a status" },
]
const FOLLOW_UP_TYPES = ["create_task", "repeat"]

export const FREQUENCIES = [
  { value: "daily", label: "day", plural: "days" },
  { value: "weekly", label: "week", plural: "weeks" },
  { value: "monthly", label: "month", plural: "months" },
]

export function tagFields(schema) {
  return (schema || []).filter((field) => field.type === "tags")
}

export function settableFields(schema) {
  return (schema || []).filter((field) => SETTABLE_FIELD_TYPES.includes(field.type))
}

/** Which action types make sense for this schema (no tags field, no "Add tags"). */
export function availableActionTypes(schema, trigger = "created") {
  return ACTION_TYPES.filter((type) => {
    if (trigger === "status" && !FOLLOW_UP_TYPES.includes(type.value)) return false
    if (type.value === "add_tags") return tagFields(schema).length > 0
    if (type.value === "set_field") return settableFields(schema).length > 0
    return true
  })
}

export function defaultValueForField(field) {
  if (!field) return ""
  if (field.type === "number") return 0
  if (field.type === "dropdown") return field.options?.[0] ?? ""
  return ""
}

/** A fresh action of the given type, pointed at the first field it can use. */
export function newAction(type, schema, statuses = []) {
  if (type === "set_status") return { type, status: statuses[0] ?? "" }
  if (type === "create_task") return { type, title: "Follow up: {title}", due_in_days: 2 }
  if (type === "repeat") return { type, frequency: "weekly", interval: 1 }
  if (type === "add_tags") {
    return { type, field_id: tagFields(schema)[0]?.id ?? "", tags: [] }
  }
  if (type === "set_field") {
    const field = settableFields(schema)[0]
    return { type, field_id: field?.id ?? "", value: defaultValueForField(field), overwrite: false }
  }
  return { type: "mark_todo", due_in_days: null }
}

export function emptyRule(schema, statuses = []) {
  return {
    name: "",
    enabled: true,
    match: "all",
    trigger: "created",
    trigger_status: null,
    conditions: [],
    actions: [newAction(availableActionTypes(schema)[0]?.value ?? "mark_todo", schema, statuses)],
  }
}

/**
 * Ready-made automations, built from what the project actually has, so a person
 * starts from a sentence they recognise instead of a blank form. Each is only
 * offered when the project has what it needs.
 */
export function ruleRecipes(project) {
  const schema = project?.entry_schema || []
  const statuses = project?.statuses?.length
    ? project.statuses
    : [{ name: "Still to do", done: false }, { name: "Done", done: true }]
  const open = statuses.find((status) => !status.done)
  const done = statuses.find((status) => status.done)
  const recipes = []

  if (done) {
    recipes.push({
      id: "follow-up-when-done",
      title: "Follow up when something is done",
      detail: `When an entry moves to ${done.name}, add a task to write it up.`,
      rule: {
        ...emptyRule(schema, statuses.map((status) => status.name)),
        name: `Follow up when ${done.name}`,
        trigger: "status",
        trigger_status: done.name,
        actions: [{ type: "create_task", title: "Write up: {title}", due_in_days: 2 }],
      },
    })
  }
  if (open) {
    recipes.push({
      id: "everything-new-is-to-do",
      title: "Treat new entries as work to do",
      detail: `Every new entry starts in ${open.name} and is due in 3 days.`,
      rule: {
        ...emptyRule(schema),
        name: "New entries are work to do",
        actions: [{ type: "set_status", status: open.name }, { type: "mark_todo", due_in_days: 3 }],
      },
    })
  }
  recipes.push({
    id: "weekly-habit",
    title: "Make new entries a weekly habit",
    detail: "Every new entry repeats once a week.",
    rule: { ...emptyRule(schema), name: "Weekly habit", actions: [{ type: "repeat", frequency: "weekly", interval: 1 }] },
  })
  const choice = schema.find((field) => field.type === "dropdown" && (field.options || []).length > 0)
  if (choice && tagFields(schema).length > 0) {
    recipes.push({
      id: "tag-by-choice",
      title: `Tag by ${choice.name}`,
      detail: `When ${choice.name} is ${choice.options[0]}, add the tag "${choice.options[0].toLowerCase()}".`,
      rule: {
        ...emptyRule(schema),
        name: `Tag ${choice.options[0]}`,
        conditions: [{ field_id: choice.id, operator: "equals", value: choice.options[0] }],
        actions: [{ type: "add_tags", field_id: tagFields(schema)[0].id, tags: [choice.options[0].toLowerCase()] }],
      },
    })
  }
  return recipes
}

/**
 * Field ids that an enabled rule could fill in on a new entry.
 *
 * The entry form uses this to let those fields be left blank — otherwise a
 * required dropdown or an empty tags field would be refused before the rule
 * ever had the chance to fill it.
 */
export function ruleFillableFieldIds(rules) {
  const ids = new Set()
  for (const rule of rules || []) {
    if (!rule.enabled) continue
    for (const action of rule.actions || []) {
      if ((action.type === "set_field" || action.type === "add_tags") && action.field_id) {
        ids.add(action.field_id)
      }
    }
  }
  return ids
}

/** What's wrong with a rule before it is sent, in words, or null if nothing. */
export function ruleProblem(rule, schema) {
  if (!rule.name.trim()) return "Give the rule a name."
  if (rule.trigger === "status" && !rule.trigger_status) return "Choose which status the rule waits for."
  if (rule.actions.length === 0) return "Add at least one thing for the rule to do."
  const byId = Object.fromEntries((schema || []).map((field) => [field.id, field]))
  for (const action of rule.actions) {
    if (action.type === "set_status" && !action.status) return "Choose which status to move the entry to."
    if (action.type === "create_task" && !String(action.title ?? "").trim()) return "Say what the follow-up task is."
    if (action.type === "add_tags" && (!action.tags || action.tags.length === 0)) {
      return "Enter at least one tag to add."
    }
    if (action.type === "set_field") {
      const field = byId[action.field_id]
      if (!field) return "Choose which field to fill in."
      if ((field.type === "text" || field.type === "long_text") && !String(action.value ?? "").trim()) {
        return `Enter the text to put in "${field.name}".`
      }
      if (field.type === "number" && (action.value === "" || Number.isNaN(Number(action.value)))) {
        return `Enter a number for "${field.name}".`
      }
      if (field.type === "date" && !action.value) return `Choose a date for "${field.name}".`
    }
  }
  return null
}

/** The rule as the API expects it: numbers as numbers, nothing it doesn't know. */
export function ruleForRequest(rule, schema) {
  const byId = Object.fromEntries((schema || []).map((field) => [field.id, field]))
  return {
    name: rule.name.trim(),
    enabled: rule.enabled,
    match: rule.match,
    trigger: rule.trigger === "status" ? "status" : "created",
    trigger_status: rule.trigger === "status" ? rule.trigger_status : null,
    conditions: rule.conditions.map(({ field_id, operator, value, value2 }) => {
      const condition = { field_id, operator }
      if (value !== undefined) condition.value = value
      if (value2 !== undefined) condition.value2 = value2
      return condition
    }),
    actions: rule.actions.map((action) => {
      if (action.type === "set_status") return { type: "set_status", status: action.status }
      if (action.type === "create_task") {
        const due = action.due_in_days
        return {
          type: "create_task",
          title: String(action.title).trim(),
          due_in_days: due === "" || due === null || due === undefined ? null : Number(due),
        }
      }
      if (action.type === "repeat") {
        return { type: "repeat", frequency: action.frequency, interval: Number(action.interval) || 1 }
      }
      if (action.type === "add_tags") {
        return { type: "add_tags", field_id: action.field_id, tags: action.tags }
      }
      if (action.type === "set_field") {
        const numeric = byId[action.field_id]?.type === "number"
        return {
          type: "set_field",
          field_id: action.field_id,
          value: numeric ? Number(action.value) : action.value,
          overwrite: Boolean(action.overwrite),
        }
      }
      const due = action.due_in_days
      return { type: "mark_todo", due_in_days: due === "" || due === null || due === undefined ? null : Number(due) }
    }),
  }
}

function fieldName(byId, id) {
  return byId[id]?.name ?? "a removed field"
}

function describeValue(value) {
  if (Array.isArray(value)) return value.join(", ")
  if (value === true) return "yes"
  if (value === false) return "no"
  return String(value ?? "")
}

export function describeCondition(condition, byId) {
  const field = byId[condition.field_id]
  const operator = searchOperatorsFor(field?.type).find((item) => item.value === condition.operator)
  const verb = operator?.label ?? condition.operator
  const name = fieldName(byId, condition.field_id)
  if (condition.operator === "is_set" || condition.operator === "is_empty") return `${name} ${verb}`
  if (condition.operator === "between") {
    return `${name} ${verb} ${describeValue(condition.value)} and ${describeValue(condition.value2)}`
  }
  return `${name} ${verb} ${describeValue(condition.value)}`
}

export function describeAction(action, byId) {
  if (action.type === "set_status") return `move it to ${action.status}`
  if (action.type === "create_task") {
    const due = action.due_in_days === null || action.due_in_days === undefined ? "" : action.due_in_days === 0 ? ", due that day" : `, due in ${action.due_in_days} ${action.due_in_days === 1 ? "day" : "days"}`
    return `add the task “${action.title}”${due}`
  }
  if (action.type === "repeat") {
    const frequency = FREQUENCIES.find((item) => item.value === action.frequency)
    const every = action.interval === 1 ? `every ${frequency?.label}` : `every ${action.interval} ${frequency?.plural}`
    return `make it repeat ${every}`
  }
  if (action.type === "add_tags") {
    const tags = action.tags || []
    return `add ${tags.length === 1 ? "tag" : "tags"} ${tags.join(", ")} to ${fieldName(byId, action.field_id)}`
  }
  if (action.type === "set_field") {
    const how = action.overwrite ? "set" : "fill in"
    return `${how} ${fieldName(byId, action.field_id)} with ${describeValue(action.value)}`
  }
  if (action.due_in_days === null || action.due_in_days === undefined) return "mark it as to-do"
  if (action.due_in_days === 0) return "mark it as to-do, due the same day"
  return `mark it as to-do, due in ${action.due_in_days} ${action.due_in_days === 1 ? "day" : "days"}`
}

/** The whole rule as one sentence: "When Kind is Bug: add tag triage to Tags." */
export function describeRule(rule, schema) {
  const byId = Object.fromEntries((schema || []).map((field) => [field.id, field]))
  const conditions = (rule.conditions || []).map((condition) => describeCondition(condition, byId))
  const joiner = rule.match === "any" ? " or " : " and "
  const moment = rule.trigger === "status" ? `an entry moves to ${rule.trigger_status}` : null
  const when = moment
    ? conditions.length === 0 ? `When ${moment}` : `When ${moment} and ${conditions.join(joiner)}`
    : conditions.length === 0 ? "For every new entry" : `When ${conditions.join(joiner)}`
  const actions = (rule.actions || []).map((action) => describeAction(action, byId))
  return `${when}: ${actions.join("; ")}.`
}

export function describeRecurrence(recurrence) {
  const frequency = FREQUENCIES.find((item) => item.value === recurrence.frequency)
  if (!frequency) return "Repeats"
  const every = recurrence.interval === 1 ? `every ${frequency.label}` : `every ${recurrence.interval} ${frequency.plural}`
  return `Repeats ${every}`
}

// ── Reminders ────────────────────────────────────────────────────────────────

/** "2 days late", "today", "tomorrow", "in 3 days". */
export function dueLabel(item) {
  if (item.status === "overdue") {
    const late = -item.days_until
    return late === 1 ? "1 day late" : `${late} days late`
  }
  if (item.status === "due_today") return "today"
  return item.days_until === 1 ? "tomorrow" : `in ${item.days_until} days`
}

export function remindersLabel(summary) {
  const parts = []
  if (summary.overdue_count) parts.push(`${summary.overdue_count} overdue`)
  if (summary.due_today_count) parts.push(`${summary.due_today_count} due today`)
  if (summary.upcoming_count) parts.push(`${summary.upcoming_count} coming up`)
  return `Reminders: ${parts.join(", ")}`
}
