import { useEffect, useRef, useState } from "react"
import { createCalendarActivity, deleteCalendarActivity } from "./api"
import { dateKey } from "./calendarDates"
import "./DayActivityDialog.css"

export default function DayActivityDialog({date, events, entries, activities, loading, activityError, onClose, onSaved, onDeleted}) {
  const dialog = useRef(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { element.close() }
  }, [])
  async function save(event) {
    event.preventDefault(); setError("")
    const form = new FormData(event.currentTarget)
    const title = String(form.get("title")).trim()
    const start = form.get("start"), end = form.get("end")
    if (!title) { setError("Enter an activity title."); return }
    if (!allDay && end <= start) { setError("End time must be after start time."); return }
    setSaving(true)
    try {
      const activity = await createCalendarActivity({title, description: form.get("description"), day: dateKey(date), all_day: allDay, start_time: allDay ? null : start, end_time: allDay ? null : end})
      onSaved(activity); setAdding(false); setAllDay(false)
    } catch (caught) { setError(caught.message) }
    finally { setSaving(false) }
  }
  async function remove() {
    setDeleting(true); setError("")
    try { await deleteCalendarActivity(deleteId); onDeleted(deleteId); setDeleteId(null) }
    catch (caught) { setError(caught.message) }
    finally { setDeleting(false) }
  }
  const clock = value => new Date(value).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
  const agenda = [
    ...events.map(item => ({key:`g-${item.id}`,kind:"google",title:item.summary,label:item.accountLabel,when:item.all_day?"All day":`${clock(item.start)} – ${clock(item.end)}`,sort:item.all_day?"":clock(item.start),link:item.html_link,description:item.location})),
    ...entries.map(item => ({key:`e-${item.id}`,kind:"entry",title:item.project_name,label:"Logbook entry",when:clock(item.created_at),sort:clock(item.created_at)})),
    ...activities.map(item => ({key:`a-${item.id}`,kind:"activity",id:item.id,title:item.title,label:"Chronicles activity",when:item.all_day?"All day":`${item.start_time} – ${item.end_time}`,sort:item.all_day?"":item.start_time,description:item.description})),
  ].sort((a,b)=>a.sort.localeCompare(b.sort))
  return <dialog ref={dialog} className="day-dialog" aria-labelledby="day-dialog-title" onCancel={event => { if (saving || deleting) event.preventDefault(); else onClose() }}>
    <header className="day-dialog-header"><div><span className="day-dialog-kicker">YOUR DAY AT A GLANCE</span><h2 id="day-dialog-title">{date.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"})}</h2></div><button type="button" disabled={saving || deleting} aria-label="Close day" onClick={onClose}>×</button></header>
    <div className="day-dialog-body">
      <div className="day-dialog-tools"><p>{agenda.length} {agenda.length === 1 ? "item" : "items"} scheduled</p><button type="button" className="btn-primary" disabled={adding} onClick={()=>{setAdding(true);setError("")}}>+ Add activity</button></div>
      {loading && <p role="status">Loading your day…</p>}
      {activityError && <p className="day-error" role="alert">{activityError}</p>}
      {error && <p className="day-error" role="alert">{error}</p>}
      {adding && <form className="day-activity-form" onSubmit={save}>
        <h3>New activity</h3><p>Saved in Chronicles for {date.toLocaleDateString()}. Google calendars are not changed.</p>
        <label>Activity title<input name="title" maxLength={255} required autoFocus placeholder="e.g. Prepare project presentation" disabled={saving} /></label>
        <label className="day-check"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)} disabled={saving} />All day</label>
        {!allDay && <div className="day-time-fields"><label>Start time<input type="time" name="start" defaultValue="09:00" required disabled={saving} /></label><label>End time<input type="time" name="end" defaultValue="10:00" required disabled={saving} /></label></div>}
        <label>Notes <span>(optional)</span><textarea name="description" maxLength={4000} rows={2} disabled={saving} /></label>
        <div className="day-form-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={()=>{setAdding(false);setError("")}}>Cancel</button><button className="btn-primary" disabled={saving}>{saving?"Saving…":"Save activity"}</button></div>
      </form>}
      {!loading && !agenda.length && <div className="day-empty"><h3>A clear day.</h3><p>Add an activity, or connect another Google account to see more of your schedule.</p></div>}
      <ol className="day-agenda">{agenda.map(item=><li key={item.key} className={`day-agenda-item day-${item.kind}`}><time>{item.when}</time><div><span className="day-item-source">{item.label}</span>{item.link?.startsWith("https://")?<a href={item.link} target="_blank" rel="noopener noreferrer">{item.title} ↗</a>:<strong>{item.title}</strong>}{item.description&&<p>{item.description}</p>}{item.id&&<button type="button" className="day-delete" onClick={()=>setDeleteId(item.id)}>Delete activity</button>}</div></li>)}</ol>
      {deleteId && <div className="day-delete-confirm" role="alert"><p>Delete this Chronicles activity?</p><button type="button" disabled={deleting} onClick={()=>setDeleteId(null)}>Keep activity</button><button type="button" disabled={deleting} onClick={remove}>{deleting?"Deleting…":"Delete activity"}</button></div>}
    </div>
  </dialog>
}
