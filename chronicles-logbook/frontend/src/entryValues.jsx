/**
 * Reading an entry back, whatever shape its fields are and whenever it was
 * written.
 *
 * Two problems live here, and they are the same problem twice.
 *
 * The first: a stored value is not a string. Tags are an array, a checklist is
 * an array of objects, a link is an entry id and a project reference is a
 * project id. Rendering any of them with `String(value)` gives "a,b",
 * "[object Object],[object Object]" or a bare uuid — which is why the richer
 * field types looked broken everywhere except the form that created them. Each
 * type gets one rendering here, and every view imports it, so a tag looks like
 * a tag in the entry list, the timeline, the table and the export alike.
 *
 * The second: a project's format changes, and — since a format change no
 * longer rewrites the record — the entries written before it keep theirs. A
 * list has to show one set of columns over entries that do not all agree about
 * what the columns are. `columnsFor` works out that set, and `cellFor` decides,
 * per entry, whether a column applies to it, holds a value from an older
 * version of the field, or was never asked of it at all.
 */

import { FIELD_TYPE_META, withComputedValues } from "./fieldTypes"

/** A value nobody recorded, as distinct from one recorded as empty. */
export const NOT_RECORDED = Symbol("not recorded")

export function isBlank(value) {
  if (value === null || value === undefined || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * The fields to show across a set of entries, current format first.
 *
 * The project's live schema leads, because that is the shape its owner means
 * the project to have. Anything an entry recorded under a field the project no
 * longer asks for follows, marked `retired` — the work it recorded happened,
 * and a column that silently vanished would hide it.
 */
export function columnsFor(project, entries = []) {
  const live = project?.entry_schema || []
  const columns = live.map((field) => ({ ...field, retired: false }))
  const seen = new Set(live.map((field) => field.id))

  // Labels for fields that have left the schema: the project keeps their
  // definitions, and each entry's own snapshot covers anything older still.
  const labels = new Map(
    (project?.retired_schema || []).map((field) => [field.id, field])
  )
  for (const entry of entries) {
    for (const field of entry.schema_snapshot || []) {
      if (!labels.has(field.id)) labels.set(field.id, field)
    }
  }

  for (const entry of entries) {
    for (const fieldId of Object.keys(entry.data || {})) {
      if (seen.has(fieldId)) continue
      seen.add(fieldId)
      const definition = labels.get(fieldId)
      columns.push({
        id: fieldId,
        name: definition?.name || fieldId,
        type: definition?.type || "text",
        options: definition?.options,
        retired: true,
      })
    }
  }

  return columns
}

/**
 * Whether two formats are the same in every way a reader would notice.
 *
 * Compared field by field on the properties that define one, rather than by
 * stringifying the whole thing: the API fills every optional key in
 * (`options: null`, `expression: null`) while a stored snapshot carries only
 * the keys it was saved with, so a raw comparison reported every entry as
 * having been written under an older format.
 */
export function sameFormat(left = [], right = []) {
  if (left.length !== right.length) return false

  const shape = (field) =>
    JSON.stringify([
      field.id,
      field.name,
      field.type,
      field.options ?? null,
      field.expression ?? null,
      field.linked_project_id ?? null,
    ])

  return left.every((field, index) => shape(field) === shape(right[index]))
}

/** The format one entry was written under, falling back to the project's. */
export function schemaForEntry(entry, project) {
  const snapshot = entry?.schema_snapshot
  return snapshot && snapshot.length ? snapshot : project?.entry_schema || []
}

/**
 * One entry's values, with its calculations worked out.
 *
 * Derived from the entry's own format rather than the project's current one:
 * a calculation added last week did not exist when a month-old entry was
 * written, and filling it in now would put a figure into a record whose author
 * never saw the formula. The figure a calculated field already holds is the
 * one it was saved with, which is what a record should keep.
 */
export function valuesFor(entry, project) {
  return withComputedValues(entry?.data || {}, schemaForEntry(entry, project))
}

/**
 * What one column holds for one entry.
 *
 * `state` is the interesting part:
 *   - `current`  — recorded under this field as it is defined now;
 *   - `earlier`  — recorded under an earlier version of the same field, so it
 *                  is shown as it was written rather than forced into today's
 *                  type;
 *   - `missing`  — the entry predates the field, or left it blank. Not an
 *                  error and not a zero: nobody answered it.
 */
export function cellFor(entry, column, project) {
  const values = valuesFor(entry, project)
  const value = values[column.id]
  const written = (schemaForEntry(entry, project) || []).find(
    (field) => field.id === column.id
  )

  if (isBlank(value) && !(column.id in (entry?.data || {}))) {
    return { value: NOT_RECORDED, state: "missing", field: written || column }
  }

  const state = written && written.type !== column.type ? "earlier" : "current"
  return { value, state, field: written || column }
}

// ── Rendering one value ──────────────────────────────────────────────────────

function formatNumber(value) {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return String(value)
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1e6) / 1e6)
}

function formatDate(value) {
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Checklist progress as a pair, for both the text and the bar to read. */
export function checklistProgress(value) {
  const items = Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []
  return { done: items.filter((item) => item.completed).length, total: items.length, items }
}

/**
 * A value as plain text — for CSV-ish copies, titles, and search.
 *
 * Kept beside the React rendering rather than inside it so the two can never
 * disagree about what a checklist or a set of tags "says".
 */
export function valueToText(value, field, { projects = [], entries = [] } = {}) {
  if (value === NOT_RECORDED) return "—"
  if (isBlank(value)) return "—"

  switch (field?.type) {
    case "number":
    case "computed":
      return formatNumber(value)
    case "date":
      return formatDate(value)
    case "tags":
      return Array.isArray(value) ? value.join(", ") : String(value)
    case "checklist": {
      const { done, total, items } = checklistProgress(value)
      if (!total) return "—"
      return `${done}/${total} · ${items.map((item) => item.text).join(", ")}`
    }
    case "link": {
      const target = entries.find((entry) => entry.id === value)
      return target ? entrySummary(target) : "A linked entry"
    }
    case "project_reference": {
      const target = projects.find((project) => project.id === value)
      return target ? target.name : "A project you no longer have"
    }
    default:
      return String(value)
  }
}

/**
 * A short, human label for an entry — used wherever an entry has to be named
 * rather than shown: the link picker, a backlink chip, a row summary.
 *
 * Prefers the first field with something readable in it, which is almost
 * always the one the author thinks of as the entry's title.
 */
export function entrySummaryField(entry, schema) {
  const fields = schema && schema.length ? schema : entry?.schema_snapshot || []
  const data = entry?.data || {}

  for (const field of fields) {
    if (["computed", "project_reference", "link", "checklist"].includes(field.type)) continue
    const value = data[field.id]
    if (isBlank(value)) continue
    const text = valueToText(value, field)
    if (text && text !== "—") return field
  }

  return null
}

export function entrySummary(entry, schema) {
  const field = entrySummaryField(entry, schema)
  const data = entry?.data || {}

  if (field) {
    const text = valueToText(data[field.id], field)
    return text.length > 70 ? `${text.slice(0, 69)}…` : text
  }

  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) {
      return value.length > 70 ? `${value.slice(0, 69)}…` : value
    }
  }

  return "Untitled entry"
}

/**
 * A stored value as React, in the shape its type deserves.
 *
 * `onOpenEntry` and `onOpenProject` make links and references clickable where
 * a click can be acted on, and are simply omitted where it cannot — a chip
 * that does nothing is worse than a label.
 */
export function ValueView({
  value,
  field,
  state = "current",
  projects = [],
  entries = [],
  onOpenProject,
  onOpenEntry,
}) {
  if (value === NOT_RECORDED) {
    return (
      <span className="value-missing" title="This entry was written before the field existed">
        not recorded
      </span>
    )
  }

  if (isBlank(value)) return <span className="value-empty">—</span>

  const earlier = state === "earlier"
  const wrap = (content) =>
    earlier ? (
      <span
        className="value-earlier"
        title={`Recorded when this field was ${FIELD_TYPE_META[field?.type]?.label?.toLowerCase() || field?.type}`}
      >
        {content}
      </span>
    ) : (
      content
    )

  switch (field?.type) {
    case "tags": {
      const tags = Array.isArray(value) ? value : [value]
      return wrap(
        <span className="value-tags">
          {tags.map((tag) => (
            <span key={String(tag)} className="value-tag">
              {String(tag)}
            </span>
          ))}
        </span>
      )
    }

    case "checklist": {
      const { done, total, items } = checklistProgress(value)
      if (!total) return <span className="value-empty">—</span>
      return wrap(
        <span className="value-checklist" title={items.map((item) => item.text).join(", ")}>
          <span className="value-checklist-bar" aria-hidden="true">
            <span style={{ width: `${(done / total) * 100}%` }} />
          </span>
          <span className="value-checklist-count">
            {done}/{total}
          </span>
        </span>
      )
    }

    case "link": {
      const target = entries.find((entry) => entry.id === value)
      const label = target ? entrySummary(target) : "An entry you cannot see"
      // The marker is its own element so the label stays a text node of its
      // own: "↪ Reading List" as one string is a value nothing can match on.
      const mark = (
        <span className="value-chip-mark" aria-hidden="true">
          ↪
        </span>
      )
      if (!target || !onOpenEntry) {
        return wrap(
          <span className="value-chip is-static">
            {mark}
            <span>{label}</span>
          </span>
        )
      }
      return wrap(
        <button
          type="button"
          className="value-chip"
          onClick={() => onOpenEntry(target)}
          title={`Open ${label}`}
        >
          {mark}
          <span>{label}</span>
        </button>
      )
    }

    case "project_reference": {
      const target = projects.find((project) => project.id === value)
      const label = target ? target.name : "A project you no longer have"
      const mark = (
        <span className="value-chip-mark" aria-hidden="true">
          ◇
        </span>
      )
      if (!target || !onOpenProject) {
        return wrap(
          <span className="value-chip is-static">
            {mark}
            <span>{label}</span>
          </span>
        )
      }
      return wrap(
        <button
          type="button"
          className="value-chip"
          onClick={() => onOpenProject(target.id)}
          title={`Open ${label}`}
        >
          {mark}
          <span>{label}</span>
        </button>
      )
    }

    case "computed":
      return wrap(
        <span className="value-computed">
          {formatNumber(value)}
          <span
            className="value-computed-mark"
            aria-hidden="true"
            title="Calculated from the other fields on this entry"
          >
            ƒ
          </span>
        </span>
      )

    case "number":
      return wrap(<span className="value-number">{formatNumber(value)}</span>)

    case "date":
      return wrap(<span className="value-date">{formatDate(value)}</span>)

    default:
      return wrap(<span className="value-text">{String(value)}</span>)
  }
}
