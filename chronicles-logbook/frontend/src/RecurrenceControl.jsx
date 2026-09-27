/**
 * "Repeat" in an entry's detail view (US-3.12).
 *
 * The entry itself is the template: each new occurrence copies its current
 * title and values, with checklists unticked, dated one period after the last.
 * Whoever may edit the entry may make it repeat.
 */

import { useEffect, useState } from "react"
import { fetchRecurrence, localDateString, setRecurrence, stopRecurrence } from "./api"
import { FREQUENCIES, describeRecurrence } from "./automationRules"
import "./AutomationPanel.css"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function formatDay(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function RecurrenceControl({ projectId, entry, canManage = true, archived = false }) {
  // undefined: still loading; null: doesn't repeat; otherwise the recurrence.
  const [recurrence, setRecurrenceState] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetchRecurrence(projectId, entry.id)
      .then((loaded) => { if (active) setRecurrenceState(loaded) })
      .catch((caught) => {
        if (!active) return
        setRecurrenceState(null)
        setError(formatError(caught))
      })
    return () => { active = false }
  }, [projectId, entry.id])

  const startEditing = () => {
    setForm({
      frequency: recurrence?.frequency ?? "weekly",
      interval: recurrence?.interval ?? 1,
      starts_on: recurrence?.starts_on ?? entry.due_date ?? localDateString(),
      ends_on: recurrence?.ends_on ?? "",
    })
    setError(null)
    setEditing(true)
  }

  const save = async (event) => {
    event.preventDefault()
    if (form.ends_on && form.ends_on < form.starts_on) {
      setError("The end date can't be before the start date.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await setRecurrence(projectId, entry.id, {
        frequency: form.frequency,
        interval: Number(form.interval) || 1,
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
      })
      setRecurrenceState(saved)
      setEditing(false)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const stop = async () => {
    setSaving(true)
    setError(null)
    try {
      await stopRecurrence(projectId, entry.id)
      setRecurrenceState(null)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const canChange = canManage && !archived
  const unit = FREQUENCIES.find((item) => item.value === form?.frequency)

  return (
    <section className="entry-recurrence" aria-labelledby="entry-recurrence-heading">
      <div className="entry-recurrence-heading">
        <h3 id="entry-recurrence-heading">Repeat</h3>
        {canChange && !editing && recurrence !== undefined && (
          <div className="automation-item-actions">
            {recurrence && (
              <button type="button" className="btn-text-danger" onClick={stop} disabled={saving}>
                Stop repeating
              </button>
            )}
            <button type="button" className="btn-text" onClick={startEditing}>
              {recurrence ? "Change" : "Repeat…"}
            </button>
          </div>
        )}
      </div>

      {recurrence === undefined ? (
        <p className="hint" role="status">Checking…</p>
      ) : !editing && (
        <p className="hint">
          {recurrence
            ? `${describeRecurrence(recurrence)}${recurrence.ends_on ? ` until ${formatDay(recurrence.ends_on)}` : ""}. ${
                recurrence.active && recurrence.next_on
                  ? `Next copy on ${formatDay(recurrence.next_on)}.`
                  : "It has finished."
              }`
            : "This entry doesn't repeat."}
        </p>
      )}

      {editing && (
        <form className="entry-recurrence-form" onSubmit={save} aria-label="Repeat this entry">
          <label className="field-label">
            Every
            <input
              type="number"
              min="1"
              max="365"
              value={form.interval}
              onChange={(event) => setForm({ ...form, interval: event.target.value })}
            />
          </label>
          <label className="field-label">
            Period
            <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
              {FREQUENCIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {Number(form.interval) === 1 ? item.label : item.plural}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Starting from
            <input
              type="date"
              required
              value={form.starts_on}
              onChange={(event) => setForm({ ...form, starts_on: event.target.value })}
            />
          </label>
          <label className="field-label">
            Until (optional)
            <input
              type="date"
              value={form.ends_on}
              min={form.starts_on}
              onChange={(event) => setForm({ ...form, ends_on: event.target.value })}
            />
          </label>
          <p className="hint">
            The first copy is made one {unit?.label ?? "period"} after the start date, then every{" "}
            {Number(form.interval) === 1 ? unit?.label : `${form.interval} ${unit?.plural}`} after that.
          </p>
          <div className="actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
