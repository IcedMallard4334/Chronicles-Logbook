import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

import { deleteEntry, fetchEntryMigrationPreview, fetchTasks, updateEntry } from "./api"
import { FIELD_TYPE_META, withComputedValues } from "./fieldTypes"
import { useDialogFocus } from "./useDialogFocus"

// Kept separate from App.jsx (which has its own copy, same as ProfilePage.jsx
// does) so this file has no import edge back into App.jsx — EntryDetailModal
// is shared by both App.jsx (the per-project entry list) and WorkspacePages.jsx
// (the cross-project "All Entries" table), and a two-line function isn't worth
// the circular import that sharing it would otherwise cost.
function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
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
      className="log-link-chip"
      onClick={() => onOpen(targetId)}
      title={`Open ${target.name}`}
    >
      {content}
    </button>
  )
}

function TagsInput({ value, onChange }) {
  const [input, setInput] = useState("")

  const addTag = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
    setInput("")
  }

  const removeTag = (tag) => {
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
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? "Type and press Enter…" : ""}
      />
    </div>
  )
}

function ChecklistInput({ value, onChange }) {
  const [input, setInput] = useState("")

  const addItem = () => {
    const text = input.trim()
    if (text) {
      onChange([
        ...value,
        { id: `ci-${Math.random().toString(36).slice(2, 9)}`, text, completed: false },
      ])
    }
    setInput("")
  }

  const toggleItem = (id) => {
    onChange(value.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
  }

  const removeItem = (id) => {
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item and press Enter…"
        />
      </div>
      {value.length > 0 && (
        <span className="checklist-count">
          {value.filter((i) => i.completed).length}/{value.length} complete
        </span>
      )}
    </div>
  )
}

function LinkInput({ value, onChange, entries }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="link-select"
    >
      <option value="">No link</option>
      {entries.map((entry) => {
        // Build a preview from the first text field value
        const preview = Object.values(entry.data || {})
          .find((v) => typeof v === "string") || entry.id.slice(0, 8)
        return (
          <option key={entry.id} value={entry.id}>
            {String(preview).slice(0, 60)} — {new Date(entry.created_at).toLocaleDateString()}
          </option>
        )
      })}
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
export function EntryFieldInput({ field, value, computed, projects, status, entries = [], onOpenProject, onChange }) {
  if (field.type === "computed") {
    // The badge's word and colour come from the field-type registry, so the
    // form, the table and the schema view can never disagree about what a
    // type is called or how it is marked.
    const meta = FIELD_TYPE_META[field.type]
    return (
      <div className="field-label is-computed">
        <span className="field-label-text">
          {field.name}
          <span className={`field-readonly-tag is-${meta.color}`}>{meta.badge}</span>
        </span>
        <output className="computed-value">
          {computed === null || computed === undefined ? "—" : computed}
        </output>
      </div>
    )
  }

  // A link is decided once, in the schema (US-2.4), rather than answered
  // on every entry — so it is shown rather than asked for. The value is the
  // same chip the entry list shows: the target's name on its status dot,
  // clickable through to the project. A boxed read-out would read as a text
  // box awaiting input; a chip reads as a thing you act on.
  if (field.type === "project_reference") {
    const meta = FIELD_TYPE_META[field.type]
    return (
      <div className="field-label is-computed">
        <span className="field-label-text">
          {field.name}
          <span className={`field-readonly-tag is-${meta.color}`}>{meta.badge}</span>
        </span>
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
      </div>
    )
  }

  // Tags and checklists hold a list, not a string, and each renders several
  // controls — so they get a div rather than a label, which would bind every
  // click to whichever control happened to come first.
  if (field.type === "tags") {
    return (
      <div className="field-label">
        <span className="field-label-text">{field.name}</span>
        <TagsInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
      </div>
    )
  }

  if (field.type === "checklist") {
    return (
      <div className="field-label">
        <span className="field-label-text">{field.name}</span>
        <ChecklistInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
      </div>
    )
  }

  if (field.type === "link") {
    return (
      <label className="field-label">
        {field.name}
        <LinkInput
          value={value || ""}
          onChange={(next) => onChange(field.id, next)}
          entries={entries}
        />
      </label>
    )
  }

  return (
    <label className="field-label">
      {field.name}
      {field.type === "dropdown" ? (
        <select value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} required>
          <option value="" disabled>
            Select…
          </option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          value={value || ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.name}
        />
      )}
    </label>
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
  return String(value)
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
            <span className="log-value">{String(retiredData[field.id])}</span>
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
export function EntryDetailModal({ project, entry, projects = [], canManage = true, onClose, onSaved, onDeleted }) {
  const [mode, setMode] = useState("view")
  const [migrateChosen, setMigrateChosen] = useState(false)
  const [migrationError, setMigrationError] = useState(null)
  const [title, setTitle] = useState(entry.title || "")
  const [data, setData] = useState(entry.data || {})
  const [hoursSpent, setHoursSpent] = useState(entry.time_spent ? String(Math.floor(entry.time_spent / 60)) : "")
  const [minutesSpent, setMinutesSpent] = useState(entry.time_spent ? String(entry.time_spent % 60) : "")
  const [todo, setTodo] = useState(entry.todo || false)
  const [dueDate, setDueDate] = useState(entry.due_date || "")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState(null)

  const dialogRef = useDialogFocus(true, onClose)

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

  useEffect(() => {
    if (!migrateChosen) {
      setData(entry.data || {})
      setMigrationError(null)
      return undefined
    }
    let active = true
    setMigrationError(null)
    fetchEntryMigrationPreview(project.id, entry.id)
      .then((preview) => { if (active) setData(preview.data) })
      .catch((caught) => { if (active) setMigrationError(formatError(caught)) })
    return () => { active = false }
  }, [migrateChosen, project.id, entry.id, entry.data])

  const handleFieldChange = (fieldId, value) => setData((prev) => ({ ...prev, [fieldId]: value }))

  const handleSave = async (event) => {
    event.preventDefault()
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
      }
      const hours = hoursSpent === "" ? 0 : Number(hoursSpent)
      const minutes = minutesSpent === "" ? 0 : Number(minutesSpent)
      const timeSpent = hours * 60 + minutes
      const saved = await updateEntry(project.id, entry.id, {
        title: title.trim() || null,
        data: payload,
        time_spent: timeSpent === 0 ? null : timeSpent,
        todo,
        due_date: dueDate || null,
        migrateToCurrentSchema: migrateChosen,
      })
      onSaved?.(saved)
      setMode("view")
      setMigrateChosen(false)
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
    setTitle(entry.title || "")
    setData(entry.data || {})
    setError(null)
  }

  // Rendered through a portal, straight onto <body>: EntryDetailModal opens
  // from inside ViewTransition's animated wrapper, whose entrance animation
  // leaves a resolved (if visually identity) `transform` behind even after
  // it finishes — any *other* transform value than the literal keyword
  // `none` makes that wrapper a containing block for a `position: fixed`
  // descendant, so without the portal this modal centers itself inside the
  // wrapper's full scrollable height instead of the actual viewport, and
  // can render partly above or below what's currently on screen. A portal
  // sidesteps the whole class of ancestor-CSS problem, not just this one.
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal-card entry-detail-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-detail-heading"
        onMouseDown={(event) => event.stopPropagation()}
        tabIndex={-1}
      >
        <h2 id="entry-detail-heading">{entry.title || "Entry detail"}</h2>
        <p className="entry-detail-meta">
          {project.name}
          {entry.created_by_name && <> · logged by {entry.created_by_name}</>}
          {" · "}
          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
        </p>

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
                <dd>{entry.todo ? `Still to do${entry.due_date ? ` · due ${entry.due_date}` : ""}` : "Done"}</dd>
              </div>
            </dl>
            <RetiredValues retiredData={entry.retired_data || {}} retiredSchema={project.retired_schema || []} />
            {canManage && (
              <div className="actions">
                {confirmingDelete ? (
                  <>
                    <span className="entry-detail-confirm-text">
                      Delete this entry? This can&rsquo;t be undone.
                    </span>
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button type="button" className="btn-danger" onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? "Deleting…" : "Yes, delete"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(true)}>
                      Delete
                    </button>
                    <button type="button" className="btn-primary" onClick={() => setMode("edit")}>
                      Edit
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleSave}>
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
            <label className="field-label">
              Title (optional)
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give this entry a name"
              />
            </label>
            <div className="form-grid">
              {activeSchema.map((field) => (
                <EntryFieldInput
                  key={field.id}
                  field={field}
                  value={data[field.id]}
                  computed={withComputedValues(data, activeSchema)[field.id]}
                  projects={linkable}
                  status={statuses[field.linked_project_id]}
                  onChange={handleFieldChange}
                />
              ))}
            </div>
            <div className="form-grid time-tracking">
              <label className="field-label">
                Hours spent
                <input type="number" min={0} value={hoursSpent} onChange={(event) => setHoursSpent(event.target.value)} />
              </label>
              <label className="field-label">
                Minutes spent
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutesSpent}
                  onChange={(event) => setMinutesSpent(event.target.value)}
                />
              </label>
            </div>
            <div className="form-grid entry-outstanding">
              <label className="field-label checkbox-label">
                <input type="checkbox" checked={todo} onChange={(event) => setTodo(event.target.checked)} />
                This is still to do
              </label>
              <label className="field-label">
                Due date
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button type="button" className="btn-text" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}

        <button type="button" className="modal-close" onClick={onClose} aria-label="Close entry detail">
          ×
        </button>
      </div>
    </div>,
    document.body
  )
}
