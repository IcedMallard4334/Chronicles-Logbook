import { useCallback, useEffect, useMemo, useState } from "react"
import ActivityForm from "./ActivityForm"
import { createCalendarActivity, deleteCalendarActivity, fetchCalendarActivities, updateCalendarActivity } from "./api"
import { dateKey } from "./calendarDates"
import "./ActivitiesPage.css"
import { TrashButton } from "./TrashIcon"

const SPAN_DAYS = 183

const when = (activity) => (activity.all_day ? "All day" : `${activity.start_time} – ${activity.end_time}`)
const dayLabel = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })

/**
 * Every activity saved in Chronicles — the ones added from the Calendar and
 * the ones added here — to add to, edit or delete.
 */
export default function ActivitiesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [retry, setRetry] = useState(0)
  const todayKey = dateKey(new Date())

  useEffect(() => {
    let active = true
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - SPAN_DAYS)
    const end = new Date(now); end.setDate(end.getDate() + SPAN_DAYS)
    setLoading(true); setError("")
    fetchCalendarActivities({ start: dateKey(start), end: dateKey(end) })
      .then((data) => { if (active) setItems(data) })
      .catch((caught) => { if (active) setError(caught.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  const { upcoming, earlier } = useMemo(() => {
    const byTime = (a, b) => a.day.localeCompare(b.day) || (a.start_time || "").localeCompare(b.start_time || "")
    return {
      upcoming: items.filter((item) => item.day >= todayKey).sort(byTime),
      earlier: items.filter((item) => item.day < todayKey).sort((a, b) => byTime(b, a)),
    }
  }, [items, todayKey])

  const run = useCallback(async (action) => {
    setSaving(true); setError("")
    try { await action() } catch (caught) { setError(caught.message) } finally { setSaving(false) }
  }, [])

  const create = (payload) => run(async () => {
    const saved = await createCalendarActivity(payload)
    setItems((current) => [...current, saved])
    setAdding(false)
  })
  const update = (payload) => run(async () => {
    const saved = await updateCalendarActivity(editing.id, payload)
    setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    setEditing(null)
  })
  const remove = () => run(async () => {
    await deleteCalendarActivity(deleteId)
    setItems((current) => current.filter((item) => item.id !== deleteId))
    setDeleteId(null)
  })

  const section = (heading, list, empty) => (
    <section className="activities-section" aria-label={heading}>
      <h2>{heading}</h2>
      {list.length === 0 ? <p className="hint">{empty}</p> : (
        <ul className="activities-list">
          {list.map((activity) => (
            <li key={activity.id} className="activity-row">
              <div className="activity-when"><strong>{dayLabel(activity.day)}</strong><span>{when(activity)}</span></div>
              <div className="activity-main">
                <strong>{activity.title}</strong>
                {activity.description && <p>{activity.description}</p>}
              </div>
              <div className="activity-actions">
                <button type="button" className="btn-text" disabled={saving} aria-label={`Edit activity ${activity.title}`} onClick={() => { setEditing(activity); setAdding(false) }}>Edit</button>
                <TrashButton label={`Delete activity ${activity.title}`} disabled={saving} onClick={() => setDeleteId(activity.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <section className="workspace-page activities-page" aria-label="Activities workspace">
      <header className="workspace-heading">
        <div>
          <span className="workspace-eyebrow">THINGS YOU HAVE PLANNED</span>
          <h1>Activities</h1>
          <p>Everything you have scheduled in Chronicles, including what you added from the Calendar. Google calendars are never changed.</p>
        </div>
        <button type="button" className="btn-primary" disabled={adding || Boolean(editing)} onClick={() => setAdding(true)}>+ Add activity</button>
      </header>

      {error && <div className="workspace-error" role="alert">{error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
      {adding && <ActivityForm heading="New activity" showDay initial={{ day: todayKey }} saving={saving} onSubmit={create} onCancel={() => setAdding(false)} />}
      {editing && <ActivityForm key={editing.id} heading="Edit activity" showDay initial={editing} submitLabel="Save changes" saving={saving} onSubmit={update} onCancel={() => setEditing(null)} />}
      {deleteId && (
        <div className="day-delete-confirm" role="alert">
          <p>Delete this activity?</p>
          <button type="button" disabled={saving} onClick={() => setDeleteId(null)}>Keep activity</button>
          <TrashButton label="Delete" text={saving ? "Deleting…" : "Delete"} className="btn-trash-solid" disabled={saving} onClick={remove} />
        </div>
      )}

      {loading ? <p role="status">Loading your activities…</p> : (
        <>
          {section("Upcoming", upcoming, "Nothing scheduled. Add an activity to plan your time.")}
          {section("Earlier", earlier, "No activities in the past six months.")}
        </>
      )}
    </section>
  )
}
