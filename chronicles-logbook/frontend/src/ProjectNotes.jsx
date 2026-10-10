import { useCallback, useEffect, useState } from "react"

import { createNote, deleteNote, fetchNotes, updateNote } from "./api"
import ConfirmDialog from "./ConfirmDialog"
import "./ProjectNotes.css"

/**
 * Notes on a project: private to their author, or shared with everyone on the project.
 *
 * The server decides who can see, edit and delete each note and says so on the note itself
 * (`mine`, `can_edit`, `can_delete`), so this page never works out permissions on its own.
 * A shared note carries its author's name and a colour, so a team's notes can be told apart.
 */

export const MAX_NOTE_LENGTH = 5000
const SEARCH_DELAY_MS = 250
// The counter only appears once a note is long enough for the limit to matter.
const COUNT_SHOWN_FROM = 4000

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

function initialsOf(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}

function whenText(note) {
  const made = new Date(note.created_at)
  const changed = new Date(note.updated_at)
  const edited = changed - made > 60000
  const stamp = (edited ? changed : made).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  return edited ? `Edited ${stamp}` : stamp
}

const VISIBILITY_HELP = {
  private: "Only you can see this note.",
  shared: "Everyone on this project can see this note, with your name on it.",
}

function NoteForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [body, setBody] = useState(initial?.body || "")
  const [visibility, setVisibility] = useState(initial?.visibility || "private")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const empty = !body.trim()
  const group = `vis-${initial?.id || "new"}`

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
    <form className={`note-form${initial ? " is-editing" : ""}`} onSubmit={submit}>
      <label className="note-field">
        <span className="sr-only">{initial ? "Edit note" : "New note"}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={initial ? 4 : 3}
          placeholder="Write a note: a reminder, a decision, a link to keep…"
        />
      </label>
      <div className="note-form-bar">
        <fieldset className="note-segment">
          <legend className="sr-only">Who can see this note</legend>
          <label className={visibility === "private" ? "is-on" : ""}>
            <input type="radio" name={group} checked={visibility === "private"} onChange={() => setVisibility("private")} />
            <span>Only me</span>
          </label>
          <label className={visibility === "shared" ? "is-on" : ""}>
            <input type="radio" name={group} checked={visibility === "shared"} onChange={() => setVisibility("shared")} />
            <span>Everyone on this project</span>
          </label>
        </fieldset>
        <div className="note-form-actions">
          {body.length >= COUNT_SHOWN_FROM && (
            <span className="note-count" aria-live="polite">{body.length}/{MAX_NOTE_LENGTH}</span>
          )}
          {onCancel && (
            <button type="button" className="btn-secondary note-btn" onClick={onCancel}>Cancel</button>
          )}
          <button type="submit" className="btn-primary note-btn" disabled={empty || saving}>
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
      <p className="note-help">{VISIBILITY_HELP[visibility]}</p>
      {error && <p className="note-error" role="alert">{error}</p>}
    </form>
  )
}

function Note({ note, onChange, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
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
    setConfirming(false)
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
        <span className="note-avatar" aria-hidden="true">{shared ? initialsOf(note.author.full_name) : "Me"}</span>
        <div className="note-who">
          <span className="note-author">{shared ? note.author.full_name : "Only you can see this"}</span>
          <span className="note-when">{whenText(note)}</span>
        </div>
        <div className="note-badges">
          {note.pinned && <span className="note-badge is-pinned">Pinned</span>}
          <span className={`note-badge ${shared ? "is-shared" : "is-private"}`}>{shared ? "Shared" : "Private"}</span>
        </div>
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
            <button type="button" className="note-link is-danger" onClick={() => setConfirming(true)}>Delete</button>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this note?"
          message="The note will be removed for good. This cannot be undone."
          confirmLabel="Delete note"
          danger
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
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
  const [search, setSearch] = useState("")
  // The server does the searching (text and author's name, any case); waiting a moment after the
  // last keystroke keeps it to one request per pause rather than one per letter.
  const [term, setTerm] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    setError("")
    try {
      setNotes(await fetchNotes(projectId, term))
    } catch (caught) {
      setError(formatError(caught))
    }
  }, [projectId, term])

  useEffect(() => {
    load()
  }, [load])

  // The server returns pinned first, then newest. Local changes keep that order.
  const arrange = (list) =>
    [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at))

  const shown = (notes || []).filter((note) => filter === "all" || note.visibility === filter)

  return (
    <section className="project-notes" aria-labelledby="notes-heading">
      <div className="notes-head">
        <h3 id="notes-heading">Notes</h3>
        {notes && <span className="notes-total">{notes.length === 1 ? "1 note" : `${notes.length} notes`}</span>}
      </div>
      <NoteForm
        submitLabel="Add note"
        onSubmit={async (fields) => {
          const created = await createNote(projectId, fields)
          // With a search active the new note may not match it, so the list is asked for again.
          if (term) await load()
          else setNotes((current) => arrange([created, ...(current || [])]))
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
          <div className="note-toolbar">
            <label className="note-search">
              <span className="sr-only">Search notes</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notes by text or author"
                maxLength={200}
              />
            </label>
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
          </div>
          {shown.length === 0 ? (
            <p className="notes-empty" role="status">
              {term
                ? `No notes match “${term}”.`
                : notes.length === 0
                  ? "No notes yet. Write the first one above."
                  : "No notes of this kind."}
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
