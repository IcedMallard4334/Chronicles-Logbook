/**
 * The controls for filling a field in, in one place.
 *
 * Three screens ask somebody to type a value into a user-defined field — the
 * project's capture form, the entry editor, and quick capture — and each had
 * grown its own tags box and its own checklist. Three implementations of
 * "press Enter to add a tag" is three chances for them to behave differently,
 * which is exactly the kind of difference that makes a field type feel broken.
 *
 * The project's own capture form keeps its richer rendering of links and
 * references — it shows a project's status dot beside the name — and takes the
 * inputs below for everything else. The editor and quick capture use
 * `CaptureField` whole.
 */

import { useState } from "react"
import { FIELD_TYPE_META } from "./fieldTypes"
import { entrySummary } from "./entryValues"

export function TagsInput({ value, onChange, id }) {
  const [draft, setDraft] = useState("")
  const tags = Array.isArray(value) ? value : []

  const add = () => {
    const tag = draft.trim()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft("")
  }

  return (
    <div className="tags-input">
      <div className="tags-list">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add()
          }
          // Backspace on an empty box takes the last tag back off, which is
          // what every other tag input in the world does.
          if (event.key === "Backspace" && draft === "" && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        // Committed on blur as well as on Enter: a tag typed and then clicked
        // away from was silently thrown out.
        onBlur={add}
        placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
      />
    </div>
  )
}

export function ChecklistInput({ value, onChange, id }) {
  const [draft, setDraft] = useState("")
  const items = Array.isArray(value) ? value : []

  const move = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="checklist-input">
      {items.map((item, index) => (
        <div key={item.id} className="checklist-item">
          <input
            type="checkbox"
            checked={Boolean(item.completed)}
            onChange={() =>
              onChange(
                items.map((other) =>
                  other.id === item.id ? { ...other, completed: !other.completed } : other
                )
              )
            }
          />
          <span className={item.completed ? "checklist-done" : ""}>{item.text}</span>
          <div className="checklist-actions">
            <button
              type="button"
              className="btn-text-small"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-text-small"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="btn-text-small btn-text-danger"
              onClick={() => onChange(items.filter((other) => other.id !== item.id))}
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <div className="checklist-add">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const text = draft.trim()
            if (!text) return
            onChange([
              ...items,
              { id: `ci-${Math.random().toString(36).slice(2, 9)}`, text, completed: false },
            ])
            setDraft("")
          }}
          placeholder="Add item and press Enter…"
        />
      </div>
      {items.length > 0 && (
        <span className="checklist-count">
          {items.filter((item) => item.completed).length}/{items.length} complete
        </span>
      )}
    </div>
  )
}

/**
 * Choosing which entry this one points at.
 *
 * Entries are named by `entrySummary` — the first field with something
 * readable in it, which is almost always what the author thinks of as the
 * title. Taking the first string value in insertion order, as this used to,
 * produced a bare uuid whenever the leading text field was empty.
 */
export function LinkInput({ value, onChange, entries, id }) {
  if (entries.length === 0) {
    return (
      <p className="hint field-inline-hint">
        Nothing to link to yet — this is the project&rsquo;s first entry.
      </p>
    )
  }

  return (
    <select
      id={id}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className="link-select"
    >
      <option value="">No link</option>
      {entries.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entrySummary(entry)} —{" "}
          {new Date(entry.created_at).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </option>
      ))}
    </select>
  )
}

/**
 * One field, ready to be filled in.
 *
 * The read-only types are shown rather than asked for: a calculation is
 * derived from the figures beside it, and a project link is decided once in
 * the schema. Offering an input for either invites somebody to type a value
 * the server will immediately overwrite.
 */
export function CaptureField({ field, value, computed, entries = [], autoFocus, onChange }) {
  const meta = FIELD_TYPE_META[field.type]
  const id = `capture-${field.id}`

  if (field.type === "computed") {
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

  if (field.type === "project_reference") {
    return (
      <div className="field-label is-computed">
        <span className="field-label-text">
          {field.name}
          <span className={`field-readonly-tag is-${meta.color}`}>{meta.badge}</span>
        </span>
        <output className="computed-value is-link">
          {field.linked_project_id ? "Set by this project's format" : "Not pointed at a project yet"}
        </output>
      </div>
    )
  }

  // Tags and checklists render several controls each, so they get a div with
  // an explicit label rather than a wrapping <label>, which would bind every
  // click to whichever control happened to come first.
  if (field.type === "tags" || field.type === "checklist") {
    const Control = field.type === "tags" ? TagsInput : ChecklistInput
    return (
      <div className="field-label">
        <label className="field-label-text" htmlFor={id}>
          {field.name}
        </label>
        <Control
          id={id}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
        <span className="field-capture-hint">{meta.capture}</span>
      </div>
    )
  }

  if (field.type === "link") {
    return (
      <div className="field-label">
        <label className="field-label-text" htmlFor={id}>
          {field.name}
        </label>
        <LinkInput
          id={id}
          value={value || ""}
          onChange={(next) => onChange(field.id, next)}
          entries={entries}
        />
      </div>
    )
  }

  if (field.type === "dropdown") {
    return (
      <div className="field-label">
        <label className="field-label-text" htmlFor={id}>
          {field.name}
        </label>
        <select
          id={id}
          value={value ?? ""}
          autoFocus={autoFocus}
          onChange={(event) => onChange(field.id, event.target.value)}
          required
        >
          <option value="" disabled>
            Select…
          </option>
          {/* A value recorded before an option was withdrawn is still offered,
              so that opening an old entry and saving it cannot silently change
              an answer its author gave. */}
          {[...new Set([...(field.options || []), ...(value ? [value] : [])])].map((option) => (
            <option key={option} value={option}>
              {option}
              {(field.options || []).includes(option) ? "" : " (no longer offered)"}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="field-label">
      <label className="field-label-text" htmlFor={id}>
        {field.name}
      </label>
      <input
        id={id}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value ?? ""}
        autoFocus={autoFocus}
        onChange={(event) => onChange(field.id, event.target.value)}
        placeholder={field.name}
        required
      />
    </div>
  )
}
