import { useEffect, useId, useMemo, useState } from "react"

import { deleteEntry, fetchEntryMigrationPreview, fetchTasks, updateEntry } from "./api"
import EntryHistory from "./EntryHistory"
import { suggestedTitle } from "./entryNames"
import { timeSpentProblem } from "./timeSpent"
import { CHECKLIST_LIMIT, FIELD_TYPE_META, TAGS_LIMIT, TEXT_LIMITS, fieldTypeLabel, humaniseValue, isTextField, withComputedValues } from "./fieldTypes"
import FormField, { ShortTextBox } from "./FormField"
import { BUILT_IN_FIELDS, TITLE_MAX, missingRequired, missingRequiredMessage } from "./formFields"
import Drawer from "./Drawer"
import RecurrenceControl from "./RecurrenceControl"
import { TrashButton } from "./TrashIcon"
import { TipBubble } from "./Tip"
import StatusPicker from "./StatusPicker"
import { hasCustomStatuses, statusOf } from "./statuses"

// Kept separate from App.jsx (which has its own copy, same as ProfilePage.jsx
// does) so this file has no import edge back into App.jsx — EntryDetailModal
// is shared by both App.jsx (the per-project entry list) and WorkspacePages.jsx
// (the cross-project "All Entries" table), and a two-line function isn't worth
// the circular import that sharing it would otherwise cost.
function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

/**
 * A small "what does this mean" hint beside a control — keyboard-operable
 * (the bubble shows on focus, not just hover) and announced to a screen
 * reader via aria-describedby, rather than a plain `title` attribute, which
 * many screen readers don't reliably read.
 */
export function InfoTip({ text }) {
  const id = useId()
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-trigger" aria-describedby={id}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="sr-only">More info</span>
      </button>
      <span role="tooltip" id={id} className="info-tip-bubble">{text}</span>
    </span>
  )
}

/** The sidebar's status language for a project, read from its open tasks. */
export function deriveProjectStatus(tasks, today) {
  const late = tasks.some((task) => task.due_date && task.due_date < today)
  return late ? "Needs attention" : tasks.length ? "In progress" : "On track"
}

/**
 * The status of each of a set of projects, as the sidebar shows it.
 *
 * A link to another project carries the same dot the sidebar does, so the
 * status has to be derived the same way — one rule, learned once, read
 * anywhere. Only the projects asked for are fetched, which for a link chip
 * means the one or two a schema points at.
 */
export function useProjectStatuses(projectIds) {
  const [statuses, setStatuses] = useState({})
  const key = projectIds.join("\n")
  const ids = useMemo(() => (key ? key.split("\n") : []), [key])

  useEffect(() => {
    if (ids.length === 0) return undefined

    let active = true
    const today = new Date().toLocaleDateString("en-CA")
    Promise.allSettled(ids.map((id) => fetchTasks(id, false))).then((results) => {
      if (!active) return
      setStatuses(
        Object.fromEntries(
          results.map((result, index) => [
            ids[index],
            deriveProjectStatus(result.status === "fulfilled" ? result.value : [], today),
          ])
        )
      )
    })
    return () => {
      active = false
    }
  }, [ids])

  return statuses
}

/**
 * A project link as it reads among values: the target's name on the
 * sidebar's status dot, and — wherever a click can be acted on — the target
 * itself.
 *
 * The dot is what makes it read as a connection rather than as text: the
 * same green unless the project needs attention, exactly as the sidebar
 * shows it.
 */
export function LinkChip({ targetId, projects, status, onOpen }) {
  const target = projects.find((project) => project.id === targetId)
  const content = (
    <>
      <span
        className={`log-link-dot ${status === "Needs attention" ? "is-attention" : ""}`}
        aria-hidden="true"
      />
      {target ? target.name : "A project you no longer have"}
    </>
  )

  if (!target || !onOpen) {
    return <span className="log-link-chip is-static">{content}</span>
  }

  return (
    <button
      type="button"
      className="log-link-chip has-tip"
      onClick={() => onOpen(targetId)}
    >
      {content}
      <TipBubble text={`Open ${target.name}`} />
    </button>
  )
}

function TagsInput({ value, onChange, suggestions = [] }) {
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState(null)
  const suggestionId = useId()

  // The tags already used elsewhere in this project, minus the ones on this
  // entry: a filter only works when the same label is written the same way
  // twice, so the second time is offered rather than remembered.
  const offered = suggestions.filter((tag) => !value.includes(tag))

  const addTag = () => {
    const tag = input.trim()
    if (!tag) return
    if (tag.length > TAGS_LIMIT.length) {
      setNotice(`A tag can be at most ${TAGS_LIMIT.length} characters.`)
      return
    }
    if (value.includes(tag)) {
      setNotice(`"${tag}" is already on this entry.`)
      return
    }
    if (value.length >= TAGS_LIMIT.count) {
      setNotice(`An entry can carry up to ${TAGS_LIMIT.count} tags.`)
      return
    }
    setNotice(null)
    onChange([...value, tag])
    setInput("")
  }

  const removeTag = (tag) => {
    setNotice(null)
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="tags-input">
      <div className="tags-list">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        maxLength={TAGS_LIMIT.length}
        list={offered.length > 0 ? suggestionId : undefined}
        onChange={(e) => {
          setInput(e.target.value)
          setNotice(null)
        }}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? "Type and press Enter…" : ""}
      />
      {offered.length > 0 && (
        <datalist id={suggestionId}>
          {offered.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      )}
      <span className="tags-count">
        {value.length}/{TAGS_LIMIT.count} tags
      </span>
      {notice && (
        <p className="field-notice" role="alert">
          {notice}
        </p>
      )}
    </div>
  )
}

function ChecklistInput({ value, onChange }) {
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState(null)

  const addItem = () => {
    const text = input.trim()
    if (!text) return
    if (text.length > CHECKLIST_LIMIT.length) {
      setNotice(`An item can be at most ${CHECKLIST_LIMIT.length} characters.`)
      return
    }
    if (value.some((item) => item.text.trim().toLowerCase() === text.toLowerCase())) {
      setNotice(`"${text}" is already on this checklist.`)
      return
    }
    if (value.length >= CHECKLIST_LIMIT.count) {
      setNotice(`A checklist can hold up to ${CHECKLIST_LIMIT.count} items.`)
      return
    }
    setNotice(null)
    onChange([
      ...value,
      { id: `ci-${Math.random().toString(36).slice(2, 9)}`, text, completed: false },
    ])
    setInput("")
  }

  const toggleItem = (id) => {
    onChange(value.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
  }

  const removeItem = (id) => {
    setNotice(null)
    onChange(value.filter((item) => item.id !== id))
  }

  const moveItem = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addItem()
    }
  }

  return (
    <div className="checklist-input">
      {value.map((item, index) => (
        <div key={item.id} className="checklist-item">
          <input
            type="checkbox"
            checked={item.completed}
            onChange={() => toggleItem(item.id)}
            aria-label={item.completed ? `Untick ${item.text}` : `Tick ${item.text}`}
          />
          <span className={item.completed ? "checklist-done" : ""}>
            {item.text}
          </span>
          <div className="checklist-actions">
            <button
              type="button"
              className="btn-text-small"
              onClick={() => moveItem(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-text-small"
              onClick={() => moveItem(index, 1)}
              disabled={index === value.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="btn-text-small btn-text-danger"
              onClick={() => removeItem(item.id)}
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <div className="checklist-add">
        <input
          type="text"
          value={input}
          maxLength={CHECKLIST_LIMIT.length}
          onChange={(e) => {
            setInput(e.target.value)
            setNotice(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add item and press Enter…"
        />
      </div>
      {value.length > 0 && (
        <span className="checklist-count">
          {value.filter((i) => i.completed).length}/{value.length} complete
        </span>
      )}
      {notice && (
        <p className="field-notice" role="alert">
          {notice}
        </p>
      )}
    </div>
  )
}

/** A stored link value: the target's id — right to keep, never a name to show. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An entry named in one line.
 *
 * The entry's own title comes first — it is the name somebody chose for the
 * entry. Before titles existed, the first text a schema asked for stood in;
 * a link field's value is an id rather than words, so it never gets to
 * stand in for a name. When there is neither, the day the entry was written
 * does. Used wherever an entry has to be named in a single string — the link
 * dropdown and the backlinks line under a row — so the same entry reads the
 * same way everywhere.
 */
export function entryPreview(entry) {
  if (!entry) return "An entry that is no longer there"
  const title = typeof entry.title === "string" ? entry.title.trim() : ""
  if (title) return title.length > 60 ? `${title.slice(0, 59)}…` : title
  const firstText = Object.values(entry.data || {}).find(
    (value) =>
      typeof value === "string" &&
      value.trim() &&
      !UUID_PATTERN.test(value.trim())
  )
  const text = firstText || `Entry of ${new Date(entry.created_at).toLocaleDateString()}`
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

/**
 * The dropdown offers entries somebody has to tell apart, so the day rides
 * along — unless the preview already is that day, where repeating it would
 * only say the same thing twice.
 */
function entryOptionLabel(entry) {
  const preview = entryPreview(entry)
  const day = new Date(entry.created_at).toLocaleDateString()
  return preview.endsWith(day) ? preview : `${preview} — ${day}`
}

function LinkInput({ value, onChange, entries, ...controlProps }) {
  return (
    <select
      {...controlProps}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="link-select"
    >
      <option value="">No link</option>
      {entries.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entryOptionLabel(entry)}
        </option>
      ))}
    </select>
  )
}

/**
 * One field on the new-entry form.
 *
 * A calculation is shown rather than asked for (US-2.5): it is worked out from
 * the figures beside it, so an input would invite someone to type a value the
 * server would immediately overwrite.
 */
export function EntryFieldInput({ field, value, computed, projects, status, entries = [], suggestions = [], onOpenProject, onChange, ruleCanFill = false, optional = false }) {
  // Planned work (optional) and a field a rule fills in are never demanded.
  const required = field.required !== false && !optional && !ruleCanFill
  const ruleHint = ruleCanFill ? "Leave blank and a rule can fill this in." : null

  if (field.type === "computed") {
    // The badge's word comes from the field-type registry, so the form, the table
    // and the schema view can never disagree about what a type is called.
    const meta = FIELD_TYPE_META[field.type]
    return (
      <FormField group label={field.name} typeLabel={meta.badge} className="is-computed">
        <output className="computed-value">
          {computed === null || computed === undefined ? "—" : computed}
        </output>
      </FormField>
    )
  }

  // A link is decided once, in the schema (US-2.4), rather than answered on every
  // entry, so it is shown rather than asked for. The value is the same chip the
  // entry list shows: the target's name on its status dot, clickable through to the
  // project. A boxed read-out would read as a text box awaiting input.
  if (field.type === "project_reference") {
    const meta = FIELD_TYPE_META[field.type]
    return (
      <FormField group label={field.name} typeLabel={meta.badge} className="is-computed">
        {field.linked_project_id ? (
          <LinkChip
            targetId={field.linked_project_id}
            projects={projects}
            status={status}
            onOpen={onOpenProject}
          />
        ) : (
          <output className="computed-value is-link is-unset">
            Not pointed at a project yet
          </output>
        )}
      </FormField>
    )
  }

  const typeLabel = fieldTypeLabel(field.type)

  // Tags and checklists hold a list, not a string, and each renders several
  // controls, so they are a group rather than a single labelled box.
  if (field.type === "tags") {
    return (
      <FormField group label={field.name} typeLabel={typeLabel} required={required} hint={ruleHint}>
        <TagsInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
          suggestions={suggestions}
        />
      </FormField>
    )
  }

  if (field.type === "checklist") {
    return (
      <FormField group label={field.name} typeLabel={typeLabel}>
        <ChecklistInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
      </FormField>
    )
  }

  if (field.type === "link") {
    return (
      <FormField label={field.name} typeLabel={typeLabel} required={required} size="short">
        {(controlProps) => (
          <LinkInput
            {...controlProps}
            value={value || ""}
            onChange={(next) => onChange(field.id, next)}
            entries={entries}
          />
        )}
      </FormField>
    )
  }

  if (field.type === "dropdown") {
    return (
      <FormField label={field.name} typeLabel={typeLabel} required={required} hint={ruleHint} size="short">
        {(controlProps) => (
          <select {...controlProps} value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} required={required}>
            <option value="" disabled={required}>
              {ruleCanFill ? "Leave for the rule…" : optional ? "Leave empty for now" : "Select…"}
            </option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </FormField>
    )
  }

  const hint = ruleHint || (optional ? "Optional while this is still to do." : null)

  // Short text, long text, a number and a date. The box is a hint about the answer:
  // a line for a short answer, a tall box for a paragraph, a small one for a figure.
  if (isTextField(field)) {
    const limit = TEXT_LIMITS[field.type]
    const text = typeof value === "string" ? value : ""
    const long = field.type === "long_text"
    return (
      <FormField
        label={field.name}
        typeLabel={typeLabel}
        required={required}
        hint={hint}
        size={long ? "long" : "short"}
        count={{ length: text.length, max: limit }}
      >
        {(controlProps) =>
          long ? (
            <textarea
              {...controlProps}
              rows={5}
              maxLength={limit}
              value={text}
              onChange={(e) => onChange(field.id, e.target.value)}
              placeholder={`Write ${field.name.toLowerCase()} here`}
            />
          ) : (
            <ShortTextBox
              {...controlProps}
              maxLength={limit}
              value={text}
              onValueChange={(next) => onChange(field.id, next)}
              placeholder={field.name}
            />
          )
        }
      </FormField>
    )
  }

  return (
    <FormField label={field.name} typeLabel={typeLabel} required={required} hint={hint} size="narrow">
      {(controlProps) => (
        <input
          {...controlProps}
          type={field.type}
          value={value ?? ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.type === "number" ? "0" : undefined}
        />
      )}
    </FormField>
  )
}

/**
 * The fields every entry has: its title and the time it took.
 *
 * They are not part of a project's schema, because every entry needs them, so they
 * lead every form (the schema shows them greyed out so it is clear they are there).
 */
export function EntryBasics({ title, onTitle, hours, onHours, minutes, onMinutes, hoursInvalid = false, minutesInvalid = false, titlePlaceholder = "Give this entry a name so it is easy to find later" }) {
  const [titleField, hoursField, minutesField] = BUILT_IN_FIELDS
  return (
    <>
      <FormField
        label={titleField.name}
        typeLabel={titleField.typeLabel}
        required
        size="short"
        count={{ length: title.length, max: TITLE_MAX }}
      >
        {(controlProps) => (
          <ShortTextBox
            {...controlProps}
            required
            maxLength={TITLE_MAX}
            value={title}
            onValueChange={onTitle}
            placeholder={titlePlaceholder}
          />
        )}
      </FormField>
      <FormField label={hoursField.name} typeLabel={hoursField.typeLabel} size="narrow">
        {(controlProps) => (
          <input
            {...controlProps}
            type="number"
            min={0}
            step={1}
            value={hours}
            aria-invalid={hoursInvalid ? "true" : undefined}
            onChange={(event) => onHours(event.target.value)}
            placeholder="0"
          />
        )}
      </FormField>
      <FormField label={minutesField.name} typeLabel={minutesField.typeLabel} size="narrow">
        {(controlProps) => (
          <input
            {...controlProps}
            type="number"
            min={0}
            step={1}
            value={minutes}
            aria-invalid={minutesInvalid ? "true" : undefined}
            onChange={(event) => onMinutes(event.target.value)}
            placeholder="0"
          />
        )}
      </FormField>
    </>
  )
}

/**
 * A stored value as it should read on the page.
 *
 * A reference is held as a project id, which is the right thing to store and
 * the wrong thing to show, so it is resolved to the project's name here.
 */
export function formatEntryValue(field, value, projectNames) {
  if (value === null || value === undefined || value === "") return "—"
  if (field?.type === "project_reference") {
    return projectNames.get(value) || "A project you no longer have"
  }
  return humaniseValue(value)
}

/**
 * What an entry recorded under fields the schema has since dropped (US-2.7).
 *
 * Removing a field stops it being asked for; it does not erase what was already
 * answered. That history is kept out of the way but never out of reach.
 */
export function RetiredValues({ retiredData, retiredSchema }) {
  const fields = retiredSchema.filter(
    (field) => retiredData[field.id] !== undefined && retiredData[field.id] !== null
  )
  if (fields.length === 0) return null

  return (
    <details className="retired-values">
      <summary>No longer recorded ({fields.length})</summary>
      <div className="log-fields">
        {fields.map((field) => (
          <div key={field.id} className="log-field">
            <span className="log-label">{field.name}</span>
            <span className="log-value">{humaniseValue(retiredData[field.id])}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

/**
 * View, edit or delete one entry — reachable by clicking it anywhere an
 * entry is listed.
 *
 * An entry keeps the exact shape it was recorded in (schema_snapshot) until
 * this is the moment someone chooses, on purpose, to bring it up to the
 * project's current schema — see schema_migration.py. That choice only
 * appears when the entry is actually stale; an entry already on the current
 * schema has nothing to choose between.
 */
/**
 * An entry, opened in a side drawer: read it, edit it, see its history. The page beside
 * it stays usable, so another entry can be chosen while one is open; keyed on the entry
 * so the drawer then starts fresh on the new one instead of showing the old one's form.
 */
export function EntryDetailModal(props) {
  return <EntryDetailDrawer key={props.entry.id} {...props} />
}

function EntryDetailDrawer({ project, entry, projects = [], entries = [], canManage = true, onClose, onSaved, onDeleted }) {
  const [mode, setMode] = useState("view")
  const [migrateChosen, setMigrateChosen] = useState(false)
  const [migrationError, setMigrationError] = useState(null)
  const [title, setTitle] = useState(entry.title || suggestedTitle(entry))
  const [data, setData] = useState(entry.data || {})
  // What the entry held when the edit began (or, once it is brought up to date, what it will hold),
  // so a field that was empty then is not held against the entry now.
  const [baseline, setBaseline] = useState(entry.data || {})
  const [hoursSpent, setHoursSpent] = useState(entry.time_spent ? String(Math.floor(entry.time_spent / 60)) : "")
  const [minutesSpent, setMinutesSpent] = useState(entry.time_spent ? String(entry.time_spent % 60) : "")
  const [todo, setTodo] = useState(entry.todo || false)
  const customStatuses = hasCustomStatuses(project)
  const [status, setStatus] = useState(() => statusOf(entry, project))
  const [dueDate, setDueDate] = useState(entry.due_date || "")
  const [dueTime, setDueTime] = useState((entry.due_time || "").slice(0, 5))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState("")

  const formId = useId()

  const projectSchema = project.entry_schema || []
  const ownSchema = entry.schema_snapshot?.length ? entry.schema_snapshot : projectSchema
  const isStale = (entry.schema_version ?? 0) < (project.schema_version ?? 0)
  const activeSchema = migrateChosen ? projectSchema : ownSchema

  const projectNames = useMemo(
    () => new Map(projects.map((item) => [item.id, item.name])),
    [projects]
  )
  const linkedIds = useMemo(
    () => [
      ...new Set(
        activeSchema
          .filter((field) => field.type === "project_reference")
          .map((field) => field.linked_project_id)
          .filter(Boolean)
      ),
    ],
    [activeSchema]
  )
  const statuses = useProjectStatuses(linkedIds)
  const linkable = useMemo(() => projects.filter((item) => item.id !== project.id), [projects, project.id])

  // A link may only name an entry in the same project (US-2.3), and the tags
  // worth offering are the ones this project already uses (US-2.1) — so both
  // read from the project's own entries. The entry being edited is excluded
  // from its own link options: a link to itself carries no information.
  const linkOptions = useMemo(
    () => entries.filter((item) => item.id !== entry.id),
    [entries, entry.id]
  )
  const entryById = useMemo(() => new Map(entries.map((item) => [item.id, item])), [entries])
  // Who points at this entry (US-2.3) — the same rule the rows use, so the
  // line under a row and the one here can never disagree: an entry links to
  // this one when a link field of the project's schema carries this entry's
  // id. Bidirectionality is the point of a link, so the target gets to see
  // its sources without hunting for them.
  const backlinks = useMemo(() => {
    const linkFieldIds = projectSchema
      .filter((field) => field.type === "link")
      .map((field) => field.id)
    if (linkFieldIds.length === 0) return []
    return entries.filter(
      (item) =>
        item.id !== entry.id &&
        linkFieldIds.some((fieldId) => item.data?.[fieldId] === entry.id)
    )
  }, [entries, entry.id, projectSchema])
  const tagSuggestions = useMemo(() => {
    const tagFields = activeSchema.filter((field) => field.type === "tags")
    if (tagFields.length === 0) return []
    const seen = new Set()
    for (const item of entries) {
      for (const field of tagFields) {
        for (const tag of item.data?.[field.id] || []) {
          if (typeof tag === "string" && tag.trim()) seen.add(tag)
        }
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [entries, activeSchema])

  useEffect(() => {
    if (!migrateChosen) {
      setData(entry.data || {})
      setBaseline(entry.data || {})
      setMigrationError(null)
      return undefined
    }
    let active = true
    setMigrationError(null)
    fetchEntryMigrationPreview(project.id, entry.id)
      .then((preview) => { if (active) { setData(preview.data); setBaseline(preview.data) } })
      .catch((caught) => { if (active) setMigrationError(formatError(caught)) })
    return () => { active = false }
  }, [migrateChosen, project.id, entry.id, entry.data])

  const computedValues = useMemo(() => withComputedValues(data, activeSchema), [data, activeSchema])

  const handleFieldChange = (fieldId, value) => setData((prev) => ({ ...prev, [fieldId]: value }))

  const handleSave = async (event) => {
    event.preventDefault()
    if (!title.trim()) {
      setError("Give this entry a title so it can be found again.")
      return
    }
    const missing = missingRequiredMessage(missingRequired(activeSchema, data, { todo, previous: baseline }))
    if (missing) {
      setError(missing)
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const payload = {}
      for (const field of activeSchema) {
        if (field.type === "computed" || field.type === "project_reference") continue
        const value = data[field.id]
        if (field.type === "number") {
          payload[field.id] = value === undefined ? undefined : Number(value)
        } else if (value !== undefined) {
          payload[field.id] = value
        }
        if (payload[field.id] === undefined) delete payload[field.id]
        if (field.type === "tags" && payload[field.id] === undefined) payload[field.id] = []
        if (field.type === "checklist" && payload[field.id] === undefined) payload[field.id] = []
        if (field.type === "link" && payload[field.id] === undefined) payload[field.id] = ""
        // A tags field the entry does not need to fill in is left out when it has no tags.
        if (field.type === "tags" && (todo || field.required === false) && payload[field.id]?.length === 0) delete payload[field.id]
      }
      const timeProblem = timeSpentProblem(hoursSpent, minutesSpent, { allowTotal: entry.time_spent })
      if (timeProblem) {
        setError(timeProblem)
        setIsSaving(false)
        return
      }
      const hours = hoursSpent === "" ? 0 : Number(hoursSpent)
      const minutes = minutesSpent === "" ? 0 : Number(minutesSpent)
      const timeSpent = hours * 60 + minutes
      const saved = await updateEntry(project.id, entry.id, {
        title: title.trim(),
        data: payload,
        time_spent: timeSpent === 0 ? null : timeSpent,
        todo,
        ...(customStatuses ? { status } : {}),
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
        migrateToCurrentSchema: migrateChosen,
        note: note.trim() || undefined,
      })
      onSaved?.(saved)
      setMode("view")
      setMigrateChosen(false)
      setNote("")
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteEntry(project.id, entry.id)
      onDeleted?.(entry.id)
      onClose()
    } catch (err) {
      setError(formatError(err))
      setIsDeleting(false)
    }
  }

  const cancelEdit = () => {
    setMode("view")
    setMigrateChosen(false)
    setTitle(entry.title || suggestedTitle(entry))
    setData(entry.data || {})
    setNote("")
    setError(null)
  }

  return (
    <Drawer
      title={entry.title || "Entry detail"}
      subtitle={
        <>
          {project.name}
          {entry.created_by_name && <> · logged by {entry.created_by_name}</>}
          {" · "}
          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
        </>
      }
      onClose={onClose}
      closeLabel="Close entry detail"
      busy={isSaving || isDeleting}
      className="entry-drawer"
    >
        {isStale && (
          <p className="hint entry-detail-stale">
            Recorded under an earlier version of this project&rsquo;s schema.
            {mode === "view" && canManage && " Choose Edit to bring it up to date, if you'd like."}
          </p>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        {mode === "view" ? (
          <>
            <dl className="entry-detail-fields">
              {activeSchema.map((field) => (
                <div key={field.id} className="entry-detail-field">
                  <dt>{field.name}</dt>
                  <dd>
                    {field.type === "project_reference" && entry.data?.[field.id] ? (
                      <LinkChip
                        targetId={entry.data[field.id]}
                        projects={projects}
                        status={statuses[entry.data[field.id]]}
                      />
                    ) : field.type === "link" && entry.data?.[field.id] ? (
                      <span className="link-badge has-tip">
                        ↳ {entryById.has(entry.data[field.id]) ? entryPreview(entryById.get(entry.data[field.id])) : "linked entry"}
                        <TipBubble text={entryById.has(entry.data[field.id]) ? "This entry links to that one" : "The entry it linked to is gone"} />
                      </span>
                    ) : (
                      formatEntryValue(field, entry.data?.[field.id], projectNames)
                    )}
                  </dd>
                </div>
              ))}
              <div className="entry-detail-field">
                <dt>Time spent</dt>
                <dd>{entry.time_spent != null ? `${entry.time_spent} min` : "—"}</dd>
              </div>
              <div className="entry-detail-field">
                <dt>Status</dt>
                <dd>{customStatuses ? `${statusOf(entry, project)}${entry.todo && entry.due_date ? ` · due ${entry.due_date}${entry.due_time ? ` at ${entry.due_time.slice(0, 5)}` : ""}` : ""}` : entry.todo ? `Still to do${entry.due_date ? ` · due ${entry.due_date}${entry.due_time ? ` at ${entry.due_time.slice(0, 5)}` : ""}` : ""}` : "Done"}</dd>
              </div>
            </dl>
            {backlinks.length > 0 && (
              <p className="entry-backlinks">
                <span className="entry-backlinks-label">Linked from</span>
                {backlinks.map((source) => (
                  <span key={source.id} className="entry-backlink">
                    {entryPreview(source)}
                  </span>
                ))}
              </p>
            )}
            <RetiredValues retiredData={entry.retired_data || {}} retiredSchema={project.retired_schema || []} />
            <EntryHistory
              projectId={project.id}
              entryId={entry.id}
              canRevert={canManage && !project.archived}
              formatValue={(field, value) => formatEntryValue(field, value, projectNames)}
              onReverted={(saved) => onSaved?.(saved)}
            />
            <RecurrenceControl
              projectId={project.id}
              entry={entry}
              canManage={canManage}
              archived={Boolean(project.archived)}
            />
            {canManage && (
              <div className="actions drawer-actions">
                {confirmingDelete ? (
                  <>
                    <span className="entry-detail-confirm-text">
                      Delete this entry? It stays in its history, and you can restore it from Deleted entries.
                    </span>
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <TrashButton
                      label="Yes, delete"
                      text={isDeleting ? "Deleting…" : "Yes, delete"}
                      className="btn-trash-solid"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    />
                  </>
                ) : (
                  <>
                    <TrashButton label="Delete" text="Delete" onClick={() => setConfirmingDelete(true)} />
                    <button type="button" className="btn-primary" onClick={() => setMode("edit")}>
                      Edit
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <form id={formId} onSubmit={handleSave} noValidate>
            {isStale && (
              <div className="entry-detail-schema-choice" role="group" aria-label="Which shape to edit in">
                <button
                  type="button"
                  className={!migrateChosen ? "is-selected" : ""}
                  onClick={() => setMigrateChosen(false)}
                >
                  Edit as recorded
                </button>
                <button
                  type="button"
                  className={migrateChosen ? "is-selected" : ""}
                  onClick={() => setMigrateChosen(true)}
                >
                  Update to current schema
                </button>
              </div>
            )}
            {migrateChosen && migrationError && (
              <p className="error" role="alert">{migrationError}</p>
            )}
            <div className="form-fields">
              <EntryBasics
                title={title}
                onTitle={setTitle}
                hours={hoursSpent}
                onHours={setHoursSpent}
                minutes={minutesSpent}
                onMinutes={setMinutesSpent}
                hoursInvalid={Boolean(timeSpentProblem(hoursSpent, "", { allowTotal: entry.time_spent }))}
                minutesInvalid={Boolean(timeSpentProblem("", minutesSpent))}
                titlePlaceholder="Give this entry a name"
              />
              {activeSchema.map((field) => (
                <EntryFieldInput
                  key={field.id}
                  field={field}
                  optional={todo}
                  value={data[field.id]}
                  computed={computedValues[field.id]}
                  projects={linkable}
                  status={statuses[field.linked_project_id]}
                  entries={linkOptions}
                  suggestions={tagSuggestions}
                  onChange={handleFieldChange}
                />
              ))}
            </div>
            <section className="form-section entry-outstanding" aria-label="Progress">
              <h3 className="form-section-title">Progress</h3>
              {customStatuses && (
                <StatusPicker
                  project={project}
                  value={status}
                  onChange={(name, done) => {
                    setStatus(name)
                    setTodo(!done)
                    if (done) setDueDate("")
                  }}
                />
              )}
              <div className="checkbox-with-tip" hidden={customStatuses}>
                <label className="field-label checkbox-label">
                  <input
                    type="checkbox"
                    checked={todo}
                    onChange={(event) => {
                      setTodo(event.target.checked)
                      if (!event.target.checked) setDueDate("")
                    }}
                  />
                  This is still to do
                </label>
                <InfoTip text="Marks this as work you haven't finished yet, instead of a record of something already done. It'll show up on Outstanding and in Board's 'Still to do' column until you check it off." />
              </div>
              {todo && (
                <>
                  <FormField label="Due date" typeLabel="Date" size="narrow">
                    {(controlProps) => <input {...controlProps} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}
                  </FormField>
                  <FormField label="Time of day (optional)" typeLabel="Time" size="narrow">
                    {(controlProps) => <input {...controlProps} type="time" value={dueTime} disabled={!dueDate} onChange={(event) => setDueTime(event.target.value)} />}
                  </FormField>
                </>
              )}
            </section>
            <FormField label="Reason for change (optional)" typeLabel="Short text" size="short" count={{ length: note.length, max: 500 }}>
              {(controlProps) => (
                <ShortTextBox
                  {...controlProps}
                  maxLength={500}
                  value={note}
                  onValueChange={setNote}
                  placeholder="e.g. Corrected the hours"
                />
              )}
            </FormField>
            <div className="actions drawer-actions">
              <button type="button" className="btn-text" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
    </Drawer>
  )
}
