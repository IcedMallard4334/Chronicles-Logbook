import { useCallback, useEffect, useState } from "react"

import { createNote, deleteNote, fetchNotes, updateNote } from "./api"
import "./ProjectNotes.css"

/**
 * Notes on a project: private to their author, or shared with everyone on the project.
 *
 * The server decides who can see, edit and delete each note and says so on the note itself
 * (`mine`, `can_edit`, `can_delete`), so this page never works out permissions on its own.
 * A shared note carries its author's name and a colour, so a team's notes can be told apart.
 */

export const MAX_NOTE_LENGTH = 5000

// Eight hues spread round the wheel. A person's colour comes from their id, so it is the same
// for everyone, on every device, with nothing stored. The text and bar are drawn from the hue
// in the stylesheet, which keeps the contrast right in both themes.
const HUES = [248, 162, 24, 330, 200, 48, 285, 4]

/** The same person always gets the same colour. Exported so a test can pin it down. */
export function authorHue(userId) {
  if (!userId) return 215
  let total = 0
  for (const character of String(userId)) total = (total * 31 + character.charCodeAt(0)) >>> 0
  return HUES[total % HUES.length]
}

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function whenText(note) {
  const made = new Date(note.created_at)
  const changed = new Date(note.updated_at)
  const edited = changed - made > 60000
  const stamp = (edited ? changed : made).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  return edited ? `Edited ${stamp}` : stamp
}

function NoteForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [body, setBody] = useState(initial?.body || "")
  const [visibility, setVisibility] = useState(initial?.visibility || "private")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const empty = !body.trim()

  async function submit(event) {
    event.preventDefault()
    if (empty || saving) return
    setSaving(true)
    setError("")
    try {
      await onSubmit({ body, visibility })
      if (!initial) setBody("")
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="note-form" onSubmit={submit}>
      <label className="field-label">
        <span className={initial ? "sr-only" : ""}>{initial ? "Edit note" : "New note"}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={initial ? 5 : 3}
          placeholder="A reminder, a decision, a link to keep…"
        />
      </label>
      <fieldset className="note-visibility">
        <legend>Who can see this note</legend>
        <label>
          <input type="radio" name={`vis-${initial?.id || "new"}`} checked={visibility === "private"} onChange={() => setVisibility("private")} />
          <span><strong>Only me</strong> <small>Private. Nobody else on the project can see it.</small></span>
        </label>
        <label>
          <input type="radio" name={`vis-${initial?.id || "new"}`} checked={visibility === "shared"} onChange={() => setVisibility("shared")} />
          <span><strong>Everyone on this project</strong> <small>Shown with your name.</small></span>
        </label>
      </fieldset>
      {error && <p className="note-error" role="alert">{error}</p>}
      <div className="note-form-actions">
        <button type="submit" className="btn-primary" disabled={empty || saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
        <span className="note-count" aria-hidden="true">{body.length}/{MAX_NOTE_LENGTH}</span>
      </div>
    </form>
  )
}

function Note({ note, onChange, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const shared = note.visibility === "shared"

  async function patch(fields) {
    setError("")
    try {
      onChange(await updateNote(note.project_id, note.id, fields))
    } catch (caught) {
      setError(formatError(caught))
    }
  }

  async function remove() {
    if (!window.confirm("Delete this note? This cannot be undone.")) return
    setError("")
    try {
      await deleteNote(note.project_id, note.id)
      onRemove(note.id)
    } catch (caught) {
      setError(formatError(caught))
    }
  }

  return (
    <li
      className={`note-card ${shared ? "is-shared" : "is-private"}${note.pinned ? " is-pinned" : ""}`}
      style={shared ? { "--note-hue": authorHue(note.author.user_id) } : undefined}
    >
      <div className="note-meta">
        <span className="note-author">{shared ? note.author.full_name : "Only you can see this"}</span>
        <span className={`note-badge ${shared ? "is-shared" : "is-private"}`}>{shared ? "Shared" : "Private"}</span>
        {note.pinned && <span className="note-badge is-pinned">Pinned</span>}
        <span className="note-when">{whenText(note)}</span>
      </div>
      {editing ? (
        <NoteForm
          initial={note}
          submitLabel="Save note"
          onCancel={() => setEditing(false)}
          onSubmit={async (fields) => {
            onChange(await updateNote(note.project_id, note.id, fields))
            setEditing(false)
          }}
        />
      ) : (
        <p className="note-body">{note.body}</p>
      )}
      {error && <p className="note-error" role="alert">{error}</p>}
      {!editing && (note.can_edit || note.can_delete) && (
        <div className="note-actions">
          {note.can_edit && (
            <>
              <button type="button" className="note-link" onClick={() => setEditing(true)}>Edit</button>
              <button type="button" className="note-link" aria-pressed={note.pinned} onClick={() => patch({ pinned: !note.pinned })}>
                {note.pinned ? "Unpin" : "Pin"}
              </button>
              <button type="button" className="note-link" onClick={() => patch({ visibility: shared ? "private" : "shared" })}>
                {shared ? "Make private" : "Share with the team"}
              </button>
            </>
          )}
          {note.can_delete && (
            <button type="button" className="note-link is-danger" onClick={remove}>Delete</button>
          )}
        </div>
      )}
    </li>
  )
}

const FILTERS = [
  ["all", "All"],
  ["private", "Only me"],
  ["shared", "Shared"],
]

export default function ProjectNotes({ projectId }) {
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("all")

  const load = useCallback(async () => {
    setError("")
    try {
      setNotes(await fetchNotes(projectId))
    } catch (caught) {
      setError(formatError(caught))
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  // The server returns pinned first, then newest. Local changes keep that order.
  const arrange = (list) =>
    [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at))

  const shown = (notes || []).filter((note) => filter === "all" || note.visibility === filter)

  return (
    <section className="project-notes" aria-labelledby="notes-heading">
      <h3 id="notes-heading">Notes</h3>
      <p className="notes-intro">
        Keep what does not belong in an entry. A note is private unless you share it; shared notes are shown with their
        author&rsquo;s name for everyone on the project.
      </p>
      <NoteForm
        submitLabel="Add note"
        onSubmit={async (fields) => {
          const created = await createNote(projectId, fields)
          setNotes((current) => arrange([created, ...(current || [])]))
        }}
      />
      {error && (
        <p className="note-error" role="alert">
          {error} <button type="button" className="note-link" onClick={load}>Try again</button>
        </p>
      )}
      {notes === null && !error && <p className="notes-empty" role="status">Loading notes…</p>}
      {notes && (
        <>
          <div className="note-filters" role="group" aria-label="Show notes">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filter === key ? "active" : ""}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="notes-empty" role="status">
              {notes.length === 0 ? "No notes yet. Write the first one above." : "No notes of this kind."}
            </p>
          ) : (
            <ul className="note-list">
              {shown.map((note) => (
                <Note
                  key={note.id}
                  note={note}
                  onChange={(changed) =>
                    setNotes((current) => arrange(current.map((item) => (item.id === changed.id ? changed : item))))
                  }
                  onRemove={(id) => setNotes((current) => current.filter((item) => item.id !== id))}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
