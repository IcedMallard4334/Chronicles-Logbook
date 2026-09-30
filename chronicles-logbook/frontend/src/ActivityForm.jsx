import { useState } from "react"

/** Create or edit a Chronicles activity. Validation mirrors the server's. */
export default function ActivityForm({ initial, heading, note, showDay = false, saving = false, submitLabel = "Save activity", onSubmit, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "")
  const [description, setDescription] = useState(initial?.description || "")
  const [day, setDay] = useState(initial?.day || "")
  const [allDay, setAllDay] = useState(Boolean(initial?.all_day))
  const [start, setStart] = useState(initial?.start_time || "09:00")
  const [end, setEnd] = useState(initial?.end_time || "10:00")
  const [error, setError] = useState("")

  function submit(event) {
    event.preventDefault()
    setError("")
    if (!title.trim()) return setError("Enter an activity title.")
    if (showDay && !day) return setError("Choose a date.")
    if (!allDay && end <= start) return setError("End time must be after start time.")
    onSubmit({
      title: title.trim(),
      description,
      ...(showDay ? { day } : {}),
      all_day: allDay,
      start_time: allDay ? null : start,
      end_time: allDay ? null : end,
    })
  }

  return (
    <form className="day-activity-form" onSubmit={submit}>
      <h3>{heading}</h3>
      {note && <p>{note}</p>}
      {error && <p className="day-error" role="alert">{error}</p>}
      <label>Activity title<input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} required autoFocus placeholder="e.g. Prepare project presentation" disabled={saving} /></label>
      {showDay && <label>Date<input type="date" name="day" value={day} onChange={(e) => setDay(e.target.value)} required disabled={saving} /></label>}
      <label className="day-check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={saving} />All day</label>
      {!allDay && (
        <div className="day-time-fields">
          <label>Start time<input type="time" name="start" value={start} onChange={(e) => setStart(e.target.value)} required disabled={saving} /></label>
          <label>End time<input type="time" name="end" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={saving} /></label>
        </div>
      )}
      <label>Notes <span>(optional)</span><textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={2} disabled={saving} /></label>
      <div className="day-form-actions">
        <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  )
}
