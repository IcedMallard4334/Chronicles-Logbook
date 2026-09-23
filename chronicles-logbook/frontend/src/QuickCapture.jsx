/**
 * Capture, from anywhere, in seconds.
 *
 * The brief is blunt about why this exists: "Capture has to be quick, because
 * an entry that takes a minute to file will not be filed. Recording what was
 * just done should be a keyboard away, with anything predictable already
 * filled in." Until now the only way to write an entry was to navigate Home,
 * find the project in the sidebar, open it, and scroll to the form — four
 * moves before the first keystroke.
 *
 * "Predictable" is doing real work here, and it means remembered rather than
 * guessed:
 *
 *   - the project is the one you wrote in last;
 *   - a date field starts on today, because an entry filed now is almost
 *     always about now;
 *   - a choice and a set of tags start on what you picked last time in this
 *     project — logbook entries come in runs, and the second entry about
 *     chapter 3 is usually also about chapter 3;
 *   - a checklist starts as the same unticked steps, because a repeated piece
 *     of work repeats its steps.
 *
 * Nothing is remembered for text or number fields. A sentence and a figure are
 * the things you are actually here to record, and pre-filling them would mean
 * offering yesterday's answer as today's — which is how a logbook quietly
 * fills up with work nobody did.
 */

import { useEffect, useMemo, useState } from "react"
import { createEntry } from "./api"
import { CaptureField } from "./EntryFields"
import { withComputedValues } from "./fieldTypes"
import "./QuickCapture.css"

export const OPEN_QUICK_CAPTURE = "chronicles:open-quick-capture"

const LAST_PROJECT = "chronicles-last-project"
const REMEMBERED = "chronicles-remembered-values"

/** Types whose last value is worth offering again. See the note above. */
const REMEMBERABLE = ["dropdown", "tags", "checklist", "link"]

function readRemembered(projectId) {
  try {
    return JSON.parse(window.localStorage.getItem(REMEMBERED) || "{}")[projectId] || {}
  } catch {
    return {}
  }
}

function remember(projectId, schema, data) {
  try {
    const all = JSON.parse(window.localStorage.getItem(REMEMBERED) || "{}")
    const keep = {}
    for (const field of schema) {
      if (!REMEMBERABLE.includes(field.type)) continue
      const value = data[field.id]
      if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue
      // A checklist comes back with its ticks cleared: the steps repeat, the
      // progress does not.
      keep[field.id] =
        field.type === "checklist"
          ? value.map((item) => ({ ...item, completed: false }))
          : value
    }
    window.localStorage.setItem(REMEMBERED, JSON.stringify({ ...all, [projectId]: keep }))
  } catch {
    // Storage unavailable: the next capture simply starts blank.
  }
}

/** What a fresh capture form starts with for one project. */
export function initialValues(project) {
  const remembered = readRemembered(project.id)
  const today = new Date().toLocaleDateString("en-CA")
  const values = {}

  for (const field of project.entry_schema || []) {
    if (field.type === "date") {
      values[field.id] = today
      continue
    }
    if (remembered[field.id] !== undefined) {
      values[field.id] = remembered[field.id]
    }
  }

  return values
}

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

export default function QuickCapture({ projects, onCaptured, onOpenProject }) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [data, setData] = useState({})
  const [hours, setHours] = useState("")
  const [minutes, setMinutes] = useState("")
  const [todo, setTodo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(null)

  const writable = useMemo(
    () => projects.filter((project) => !project.archived && !project.shared_pending),
    [projects]
  )

  const project = writable.find((candidate) => candidate.id === projectId) || writable[0] || null
  const schema = project?.entry_schema || []
  const computed = useMemo(() => withComputedValues(data, schema), [data, schema])

  // Ctrl/Cmd+Enter from anywhere, and an event so the command palette and the
  // top bar can open it without threading state through everything between.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === "Escape") setOpen(false)
    }
    const onRequest = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_QUICK_CAPTURE, onRequest)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_QUICK_CAPTURE, onRequest)
    }
  }, [])

  // Opening picks up where you left off, and every change of project reloads
  // that project's own remembered values.
  useEffect(() => {
    if (!open) return
    const last = window.localStorage.getItem(LAST_PROJECT)
    const start = writable.find((candidate) => candidate.id === last) || writable[0]
    if (start) {
      setProjectId(start.id)
      setData(initialValues(start))
    }
    setHours("")
    setMinutes("")
    setTodo(false)
    setError("")
    setSaved(null)
  }, [open, writable])

  const chooseProject = (id) => {
    const next = writable.find((candidate) => candidate.id === id)
    setProjectId(id)
    setData(next ? initialValues(next) : {})
  }

  const save = async () => {
    if (!project) return
    setSaving(true)
    setError("")
    try {
      const payload = {}
      for (const field of schema) {
        // Both are derived by the server from the schema itself.
        if (field.type === "computed" || field.type === "project_reference") continue
        const value = data[field.id]
        if (field.type === "tags" || field.type === "checklist") {
          payload[field.id] = Array.isArray(value) ? value : []
          continue
        }
        if (field.type === "link") {
          payload[field.id] = value || ""
          continue
        }
        if (value === undefined || value === "") continue
        payload[field.id] = field.type === "number" ? Number(value) : value
      }

      const total = (hours === "" ? 0 : Number(hours)) * 60 + (minutes === "" ? 0 : Number(minutes))

      const entry = await createEntry(project.id, {
        data: payload,
        time_spent: total === 0 ? null : total,
        todo,
      })

      window.localStorage.setItem(LAST_PROJECT, project.id)
      remember(project.id, schema, data)
      onCaptured?.(entry)
      setSaved({ entry, projectName: project.name })

      // Ready for the next one straight away: runs of entries are the normal
      // case, and closing the box would mean reopening it.
      setData(initialValues(project))
      setHours("")
      setMinutes("")
      setTodo(false)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="qc-backdrop" role="presentation" onMouseDown={() => !saving && setOpen(false)}>
      <section
        className="qc-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-capture-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault()
            if (!saving) save()
          }
        }}
      >
        <header className="qc-head">
          <div>
            <p className="qc-eyebrow">QUICK CAPTURE</p>
            <h2 id="quick-capture-title">What did you just do?</h2>
          </div>
          <button type="button" className="qc-close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </header>

        {writable.length === 0 ? (
          <div className="qc-body">
            <p className="qc-empty">
              There is nowhere to capture to yet. Create a project first, and this box
              will open straight into it.
            </p>
          </div>
        ) : (
          <>
            <div className="qc-project">
              <label htmlFor="qc-project-select">Project</label>
              <select
                id="qc-project-select"
                value={project?.id || ""}
                onChange={(event) => chooseProject(event.target.value)}
              >
                {writable.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="qc-body">
              {schema.length === 0 ? (
                <p className="qc-empty">
                  <strong>{project.name}</strong> has no fields yet, so an entry here would
                  record only its time.{" "}
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setOpen(false)
                      onOpenProject?.(project.id)
                    }}
                  >
                    Define its format
                  </button>
                </p>
              ) : (
                <div className="qc-grid">
                  {schema.map((field, index) => (
                    <CaptureField
                      key={field.id}
                      field={field}
                      value={data[field.id]}
                      computed={computed[field.id]}
                      autoFocus={index === 0}
                      onChange={(id, value) =>
                        setData((previous) => ({ ...previous, [id]: value }))
                      }
                    />
                  ))}
                </div>
              )}

              <div className="qc-grid qc-extras">
                <label className="field-label">
                  <span className="field-label-text">Hours spent</span>
                  <input
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <label className="field-label">
                  <span className="field-label-text">Minutes spent</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <label className="field-label checkbox-label qc-check">
                  <input
                    type="checkbox"
                    checked={todo}
                    onChange={(event) => setTodo(event.target.checked)}
                  />
                  <span>This is still to do</span>
                </label>
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="qc-error" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="qc-saved" role="status">
            Saved to <strong>{saved.projectName}</strong>. Write another, or press Escape.
          </p>
        )}

        <footer className="qc-foot">
          <span className="qc-hint">
            <kbd>Ctrl</kbd>
            <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to close
          </span>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={saving || !project || writable.length === 0}
          >
            {saving ? "Saving…" : "Save entry"}
          </button>
        </footer>
      </section>
    </div>
  )
}
