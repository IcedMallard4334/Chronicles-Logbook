import { TEXT_LIMITS } from "./fieldTypes"

/**
 * The fields every entry has, whatever its project's schema says.
 *
 * Title and the time spent (hours and minutes) are needed by every entry, so they
 * are not part of a project's own schema: they are always asked for first, they are
 * shown in the schema greyed out so it is clear they are there, and they cannot be
 * renamed, retyped or removed. A project's schema is what is added on top.
 */
export const TITLE_MAX = TEXT_LIMITS.text

export const BUILT_IN_FIELDS = [
  { key: "title", name: "Title", type: "text", typeLabel: "Short text", required: true, note: "Names the entry so it can be found again." },
  { key: "hours", name: "Hours spent", type: "number", typeLabel: "Number", required: false, note: "Whole hours, with the minutes below." },
  { key: "minutes", name: "Minutes spent", type: "number", typeLabel: "Number", required: false, note: "Minutes on top of the hours, 0 to 59." },
]

const BUILT_IN_NAMES = new Set(BUILT_IN_FIELDS.map((field) => field.name.toLowerCase()))

/** Whether a field name is one of the built-in ones, which a schema may not reuse. */
export function isBuiltInName(name) {
  return BUILT_IN_NAMES.has(String(name || "").trim().toLowerCase())
}

/**
 * The fields a new project starts with, on top of the built-in ones: a place for the
 * detail of what was done and the day it happened. They are a starting point, shown
 * and editable while the project is created, and neither is demanded of an entry.
 */
export function defaultSchemaFields(makeId) {
  return [
    { id: makeId(), name: "Description", type: "long_text", required: false },
    { id: makeId(), name: "Date", type: "date", required: false },
  ]
}

const BLANK = (value) => value === undefined || value === null || (typeof value === "string" && value.trim() === "")

/**
 * The names of required fields a finished entry has left empty.
 *
 * Planned work (`todo`) may leave anything empty, a field a rule can fill is left to
 * the rule, and a field that was already empty when the entry was last saved is not
 * held against it now, so editing an older entry is never blocked by what it never had.
 * Tags and checklists have their own checks and are not judged here, and a link may always be left
 * on "No link".
 */
export function missingRequired(schema, values, { todo = false, ruleFillable = new Set(), previous = {} } = {}) {
  if (todo) return []
  return (schema || [])
    .filter((field) => field.required !== false)
    .filter((field) => !["computed", "project_reference", "tags", "checklist", "link"].includes(field.type))
    .filter((field) => !ruleFillable.has(field.id))
    .filter((field) => BLANK(values[field.id]))
    // Saved empty before: the server accepted that, so it is not held against the entry now.
    .filter((field) => !(previous && Object.hasOwn(previous, field.id) && BLANK(previous[field.id])))
    .map((field) => field.name)
}

/** "Fill in A, B and C before saving.", or null when nothing is missing. */
export function missingRequiredMessage(names) {
  if (!names.length) return null
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `Fill in ${list} before saving.`
}
