import { useEffect, useRef, useState } from "react"
import ActivityForm from "./ActivityForm"
import { createCalendarActivity, deleteCalendarActivity, updateCalendarActivity } from "./api"
import { dateKey } from "./calendarDates"
import "./DayActivityDialog.css"
import { TrashButton } from "./TrashIcon"

export default function DayActivityDialog({
  date, events, entries, activities, loading, activityError, onClose, onSaved, onUpdated, onDeleted,
  onOpenEntry, onEditProject, canManageProject, renderProjectDelete,
}) {
  const dialog = useRef(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { element.close() }
  }, [])

  async function save(payload) {
    setError(""); setSaving(true)
    try {
      const activity = await createCalendarActivity({ ...payload, day: dateKey(date) })
      onSaved(activity); setAdding(false)
    } catch (caught) { setError(caught.message) }
    finally { setSaving(false) }
  }
  async function update(payload) {
    setError(""); setSaving(true)
    try {
      const activity = await updateCalendarActivity(editing.id, { ...payload, day: editing.day })
      onUpdated?.(activity); setEditing(null)
    } catch (caught) { setError(caught.message) }
    finally { setSaving(false) }
  }
  async function remove() {
    setDeleting(true); setError("")
    try { await deleteCalendarActivity(deleteId); onDeleted(deleteId); setDeleteId(null) }
    catch (caught) { setError(caught.message) }
    finally { setDeleting(false) }
  }
  const clock = value => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const agenda = [
    ...events.map(item => ({ key: `g-${item.id}`, kind: "google", title: item.summary, label: item.accountLabel, when: item.all_day ? "All day" : `${clock(item.start)} – ${clock(item.end)}`, sort: item.all_day ? "" : clock(item.start), link: item.html_link, description: item.location })),
    ...entries.map(item => ({ key: `e-${item.id}`, kind: "entry", entry: item, title: item.project_name, label: "Logbook entry", when: clock(item.created_at), sort: clock(item.created_at) })),
    ...activities.map(item => ({ key: `a-${item.id}`, kind: "activity", activity: item, id: item.id, title: item.title, label: "Chronicles activity", when: item.all_day ? "All day" : `${item.start_time} – ${item.end_time}`, sort: item.all_day ? "" : item.start_time, description: item.description })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))
  const busy = saving || deleting
  const projectsToday = [...new Map(entries.filter(entry => canManageProject?.(entry.project_id)).map(entry => [entry.project_id, entry.project_name])).entries()]
  return <dialog ref={dialog} className="day-dialog" aria-labelledby="day-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else onClose() }}>
    <header className="day-dialog-header"><div><span className="day-dialog-kicker">YOUR DAY AT A GLANCE</span><h2 id="day-dialog-title">{date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h2></div><button type="button" disabled={busy} aria-label="Close day" onClick={onClose}>×</button></header>
    <div className="day-dialog-body">
      <div className="day-dialog-tools"><p>{agenda.length} {agenda.length === 1 ? "item" : "items"} scheduled</p><button type="button" className="btn-primary" disabled={adding || Boolean(editing)} onClick={() => { setAdding(true); setError("") }}>+ Add activity</button></div>
      {loading && <p role="status">Loading your day…</p>}
      {activityError && <p className="day-error" role="alert">{activityError}</p>}
      {error && <p className="day-error" role="alert">{error}</p>}
      {adding && <ActivityForm heading="New activity" note={`Saved in Chronicles for ${date.toLocaleDateString()}. Google calendars are not changed.`} saving={saving} onSubmit={save} onCancel={() => { setAdding(false); setError("") }} />}
      {editing && <ActivityForm key={editing.id} initial={editing} heading="Edit activity" note="Changes are saved in Chronicles only. Google calendars are not changed." submitLabel="Save changes" saving={saving} onSubmit={update} onCancel={() => { setEditing(null); setError("") }} />}
      {!loading && !agenda.length && <div className="day-empty"><h3>A clear day.</h3><p>Add an activity, or connect another Google account to see more of your schedule.</p></div>}
      <ol className="day-agenda">{agenda.map(item => <li key={item.key} className={`day-agenda-item day-${item.kind}`}><time>{item.when}</time><div>
        <span className="day-item-source">{item.label}</span>
        {item.link?.startsWith("https://") ? <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title} ↗</a> : <strong>{item.title}</strong>}
        {item.description && <p>{item.description}</p>}
        {item.kind === "activity" && <div className="day-item-actions">
          <button type="button" className="btn-text" disabled={busy} onClick={() => { setEditing(item.activity); setAdding(false); setError("") }} aria-label={`Edit activity ${item.title}`}>Edit</button>
          <TrashButton className="day-delete" label="Delete activity" text="Delete activity" onClick={() => setDeleteId(item.id)} />
        </div>}
        {item.kind === "entry" && onOpenEntry && <div className="day-item-actions">
          <button type="button" className="btn-text" onClick={() => onOpenEntry(item.entry)} aria-label={`Open entry from ${item.title}`}>Open, edit or delete entry</button>
        </div>}
      </div></li>)}</ol>
      {projectsToday.length > 0 && onEditProject && <section className="day-projects" aria-label="Projects with entries on this day">
        <h3>Projects</h3>
        <ul>{projectsToday.map(([id, name]) => <li key={id}><strong>{name}</strong>
          <button type="button" className="btn-text" onClick={() => onEditProject(id)} aria-label={`Edit project ${name}`}>Edit project</button>
          {renderProjectDelete?.(id)}
        </li>)}</ul>
      </section>}
      {deleteId && <div className="day-delete-confirm" role="alert"><p>Delete this Chronicles activity?</p><button type="button" disabled={deleting} onClick={() => setDeleteId(null)}>Keep activity</button><TrashButton label="Delete activity" text={deleting ? "Deleting…" : "Delete activity"} className="btn-trash-solid" disabled={deleting} onClick={remove} /></div>}
    </div>
  </dialog>
}
