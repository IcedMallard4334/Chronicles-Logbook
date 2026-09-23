/**
 * Reading, correcting and removing one entry.
 *
 * A logbook without these is a write-only file. You mistype an hour count, or
 * paste the wrong line, and there is nothing to be done about it — which is
 * exactly the thing that stops people trusting a record enough to keep using
 * it.
 *
 * The form is built from the entry's **own** format, not the project's current
 * one. A project's fields change over time and entries keep the shape they
 * were written in, so correcting a two-month-old entry has to ask for the
 * fields it actually has. Asking for today's fields would quietly turn a
 * correction into a migration, which is the behaviour this whole design exists
 * to avoid.
 */

import { useEffect, useMemo, useState } from "react"
import { deleteEntry, fetchEntries, updateEntry } from "./api"
import { withComputedValues } from "./fieldTypes"
import { CaptureField } from "./EntryFields"
import { ValueView, columnsFor, entrySummary, sameFormat, schemaForEntry } from "./entryValues"
import "./EntryEditor.css"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

/** Minutes as the two boxes the capture form uses. */
function splitDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return { hours: "", minutes: "" }
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) }
}

/** The same compact "3h 20m" the rest of the app shows — never "2h 0m". */
function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  if (!rest) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * The entry panel: read it, correct it, or remove it.
 *
 * Opens read-only. Editing is a deliberate second click, because most of the
 * time this is opened to read rather than to change, and a form that is
 * already editable invites an accidental keystroke into a record.
 */
export default function EntryEditor({
  entry,
  project,
  projects = [],
  canEdit = true,
  onClose,
  onSaved,
  onDeleted,
  onOpenProject,
}) {
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState(() => ({ ...(entry.data || {}) }))
  const [duration, setDuration] = useState(() => splitDuration(entry.time_spent))
  const [todo, setTodo] = useState(Boolean(entry.todo))
  const [dueDate, setDueDate] = useState(entry.due_date || "")
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState("")
  const [siblings, setSiblings] = useState([])

  // The format this entry was written under — not the project's current one.
  const schema = useMemo(() => schemaForEntry(entry, project), [entry, project])
  const current = project?.entry_schema || []
  const isOlderFormat = useMemo(() => !sameFormat(schema, current), [schema, current])

  const computed = useMemo(() => withComputedValues(data, schema), [data, schema])

  // Only loaded when there is a link field to fill, so opening an ordinary
  // entry costs no extra request.
  useEffect(() => {
    if (!schema.some((field) => field.type === "link")) return undefined
    let active = true
    fetchEntries(project.id)
      .then((all) => {
        if (active) setSiblings(all.filter((other) => other.id !== entry.id))
      })
      .catch(() => {
        if (active) setSiblings([])
      })
    return () => {
      active = false
    }
  }, [project?.id, entry.id, schema])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, saving])

  const columns = useMemo(() => columnsFor({ ...project, entry_schema: schema }, [entry]), [project, schema, entry])

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      const payload = {}
      for (const field of schema) {
        // Derived server-side from the schema itself, so sending either would
        // be a guess the server has to throw away.
        if (field.type === "computed" || field.type === "project_reference") continue
        const value = data[field.id]
        if (value === undefined) continue
        payload[field.id] = field.type === "number" ? Number(value) : value
      }

      const hours = duration.hours === "" ? 0 : Number(duration.hours)
      const minutes = duration.minutes === "" ? 0 : Number(duration.minutes)
      const total = hours * 60 + minutes

      const saved = await updateEntry(project.id, entry.id, {
        data: payload,
        time_spent: total === 0 ? null : total,
        todo,
        due_date: dueDate || null,
      })
      onSaved(saved)
      setEditing(false)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError("")
    try {
      await deleteEntry(project.id, entry.id)
      onDeleted(entry.id)
    } catch (caught) {
      setError(formatError(caught))
      setSaving(false)
    }
  }

  return (
    <div className="editor-backdrop" onClick={() => !saving && onClose()} role="presentation">
      <div
        className="editor-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-editor-title"
      >
        <header className="editor-head">
          <div>
            <p className="editor-eyebrow">{project?.name}</p>
            <h2 id="entry-editor-title">{entrySummary(entry, schema)}</h2>
            <p className="editor-meta">
              <time dateTime={entry.created_at}>
                {new Date(entry.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
              {entry.created_by_name && <span> · {entry.created_by_name}</span>}
              {entry.todo && <span className="editor-flag">Still to do</span>}
            </p>
          </div>
          <button type="button" className="editor-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {isOlderFormat && (
          <p className="editor-format-note" role="note">
            Written under an earlier version of this project&rsquo;s format. It is shown
            and edited with the fields it actually has, so correcting it cannot
            reshape it.
          </p>
        )}

        <div className="editor-body">
          {schema.length === 0 ? (
            <p className="editor-empty">
              This entry records only its time and date — the project had no fields when
              it was written.
            </p>
          ) : editing ? (
            <div className="editor-grid">
              {schema.map((field) => (
                <CaptureField
                  key={field.id}
                  field={field}
                  value={data[field.id]}
                  computed={computed[field.id]}
                  entries={siblings}
                  onChange={(id, value) => setData((previous) => ({ ...previous, [id]: value }))}
                />
              ))}
            </div>
          ) : (
            <dl className="editor-readout">
              {columns.map((column) => (
                <div key={column.id}>
                  <dt>{column.name}</dt>
                  <dd>
                    <ValueView
                      value={
                        column.type === "computed"
                          ? computed[column.id]
                          : (entry.data || {})[column.id]
                      }
                      field={column}
                      projects={projects}
                      entries={siblings}
                      onOpenProject={onOpenProject}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {editing && (
            <div className="editor-grid editor-extras">
              <label className="field-label">
                <span className="field-label-text">Hours spent</span>
                <input
                  type="number"
                  min={0}
                  value={duration.hours}
                  onChange={(event) =>
                    setDuration((previous) => ({ ...previous, hours: event.target.value }))
                  }
                  placeholder="0"
                />
              </label>
              <label className="field-label">
                <span className="field-label-text">Minutes spent</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={duration.minutes}
                  onChange={(event) =>
                    setDuration((previous) => ({ ...previous, minutes: event.target.value }))
                  }
                  placeholder="0"
                />
              </label>
              <label className="field-label checkbox-label editor-check">
                <input type="checkbox" checked={todo} onChange={(event) => setTodo(event.target.checked)} />
                <span>This is still to do</span>
              </label>
              <label className="field-label">
                <span className="field-label-text">Due date</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
          )}

          {!editing && formatDuration(entry.time_spent) && (
            <p className="editor-time">
              <strong>{formatDuration(entry.time_spent)}</strong> logged
            </p>
          )}
        </div>

        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}

        <footer className="editor-foot">
          {confirmingDelete ? (
            <>
              <p className="editor-confirm">Remove this entry for good?</p>
              <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
                Keep it
              </button>
              <button type="button" className="btn-danger" onClick={remove} disabled={saving}>
                {saving ? "Removing…" : "Remove entry"}
              </button>
            </>
          ) : editing ? (
            <>
              <button
                type="button"
                className="editor-delete"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setData({ ...(entry.data || {}) })
                  setDuration(splitDuration(entry.time_spent))
                  setTodo(Boolean(entry.todo))
                  setDueDate(entry.due_date || "")
                  setEditing(false)
                  setError("")
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  className="editor-delete"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              {canEdit && (
                <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
                  Edit entry
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
