import DayActivityDialog from "./DayActivityDialog"
import { EntryDetailModal } from "./EntryShared"
import { useEffect, useMemo, useState } from "react"
import { disconnectGoogleCalendar, fetchEntriesGlobal, fetchGoogleCalendarAuthUrl, fetchGoogleCalendarEvents, fetchGoogleCalendarStatus, fetchCalendarActivities } from "./api"
import { dateKey, monthDays, groupGoogleEvents } from "./calendarDates"
import "./CalendarView.css"

const time = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export default function CalendarView({ projects = [], userId = null, onEditProject, renderProjectDelete } = {}) {
  const [openEntry, setOpenEntry] = useState(null)
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const [accounts, setAccounts] = useState([])
  const [hiddenAccounts, setHiddenAccounts] = useState([])
  const [activities, setActivities] = useState([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activityError, setActivityError] = useState("")
  const [dayOpen, setDayOpen] = useState(false)
  const connected = accounts.length > 0
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [entries, setEntries] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [refresh, setRefresh] = useState(0)
  const year = month.getFullYear(), monthIndex = month.getMonth()
  const days = useMemo(() => monthDays(year, monthIndex), [year, monthIndex])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    if (params.has("calendar_error") || params.has("calendar_connected")) {
      setNotice(params.get("calendar_error") || "Google Calendar connected.")
      params.delete("calendar_error"); params.delete("calendar_connected")
      const query = params.toString()
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`)
    }
    fetchGoogleCalendarStatus().then(data => { if (active) setAccounts(data.accounts || []) })
      .catch(error => { if (active) setNotice(error.message) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setEntriesLoading(true)
    async function load() {
      const all = []
      for (let page = 1; active; page++) {
        const batch = await fetchEntriesGlobal({ page, pageSize: 100 })
        all.push(...batch)
        if (batch.length < 100) break
      }
      if (active) setEntries(all)
    }
    load().catch(error => { if (active) setNotice(error.message) })
      .finally(() => { if (active) setEntriesLoading(false) })
    return () => { active = false }
  }, [refresh])

  useEffect(() => {
    let active = true
    setEvents([])
    if (!connected) { setLoading(false); return }
    setLoading(true)
    const end = new Date(days[41]); end.setDate(end.getDate() + 1)
    Promise.allSettled(accounts.map(account => fetchGoogleCalendarEvents({
      start: days[0].toISOString(), end: end.toISOString(), accountId: account.id,
    }))).then(results => {
      if (!active) return
      const collected = [], errors = []
      results.forEach((result, index) => {
        const account = accounts[index]
        if (result.status === "fulfilled") {
          collected.push(...result.value.map(event => ({...event, id: `${account.id}:${event.id}`, accountId: account.id, accountLabel: account.label})))
        } else errors.push(`${account.label}: ${result.reason.message}`)
      })
      setEvents(collected)
      if (errors.length) setNotice(errors.join(" · "))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [connected, accounts, days, refresh])

  useEffect(() => {
    let active = true
    setActivitiesLoading(true); setActivityError("")
    fetchCalendarActivities({start: dateKey(days[0]), end: dateKey(days[41])})
      .then(data => { if (active) setActivities(data) })
      .catch(error => { if (active) setActivityError(error.message) })
      .finally(() => { if (active) setActivitiesLoading(false) })
    return () => { active = false }
  }, [days, refresh])

  const entryMap = useMemo(() => {
    const map = new Map()
    entries.forEach(entry => {
      const key = dateKey(new Date(entry.created_at))
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(entry)
    })
    return map
  }, [entries])
  const eventMap = useMemo(() => groupGoogleEvents(events.filter(event => !hiddenAccounts.includes(event.accountId)), days), [events, days, hiddenAccounts])
  const selectedKey = dateKey(selected)
  const selectedEntries = entryMap.get(selectedKey) || []
  const selectedEvents = eventMap.get(selectedKey) || []
  const selectedActivities = activities.filter(activity => activity.day === selectedKey)
  const todayKey = dateKey(new Date())
  const projectFor = (id) => projects.find(project => project.id === id)
  const ownsProject = (id) => { const project = projectFor(id); return Boolean(project) && !project.shared }
  const openEntryProject = openEntry ? projectFor(openEntry.project_id) : null

  async function connect() {
    setBusy(true)
    try { window.location.assign(await fetchGoogleCalendarAuthUrl()) }
    catch (error) { setNotice(error.message); setBusy(false) }
  }
  async function disconnect(accountId) {
    setBusy(true)
    try { await disconnectGoogleCalendar(accountId); setAccounts(items => items.filter(item => item.id !== accountId)); setEvents(items => items.filter(item => item.accountId !== accountId)); setNotice("Google Calendar disconnected.") }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }
  function changeMonth(delta) {
    const next = new Date(year, monthIndex + delta, 1)
    setMonth(next); setSelected(next)
  }
  return (
    <section className="integrated-calendar" aria-label="Integrated calendar">
      <div className="ic-toolbar">
        <h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="ic-navigation">
          <button type="button" onClick={() => { const now = new Date(); setMonth(now); setSelected(now) }}>Today</button>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
        </div>
        <span className="ic-label">Month</span>
        <span className="ic-source">Google + Chronicles</span>
      </div>
      {notice && <div className="ic-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss calendar notice">×</button></div>}
      <div className="ic-footer">
        <div className="ic-legend"><span><i className="ic-google-dot" />Google events</span><span><i className="ic-entry-dot" />Logbook entries</span><span><i className="ic-activity-dot" />Activities</span></div>
        <div className="ic-connection">
          {(loading || entriesLoading) && (
            <span className="ic-loading" role="status">
              <span className="ic-loading-spinner" aria-hidden="true" />
              Loading…
            </span>
          )}
          <button type="button" disabled={checking || busy || loading || entriesLoading} onClick={() => { setNotice(""); setRefresh(n => n + 1) }}>Refresh</button>
          <button type="button" className="ic-connect" disabled={checking || busy} onClick={connect}>{busy ? "Opening Google…" : checking ? "Checking connection…" : connected ? "+ Add Google account" : "Connect Google Calendar"}</button>
        </div>
      </div>
      {accounts.length > 0 && <div className="ic-accounts" aria-label="Connected Google accounts">
        {accounts.map(account => <div className="ic-account" key={account.id}>
          <label><input type="checkbox" checked={!hiddenAccounts.includes(account.id)} onChange={() => setHiddenAccounts(ids => ids.includes(account.id) ? ids.filter(id => id !== account.id) : [...ids, account.id])} />{account.label}</label>
          <button type="button" disabled={busy} onClick={() => disconnect(account.id)} aria-label={`Disconnect ${account.label}`}>Disconnect</button>
        </div>)}
        <span className="ic-account-hint">Each account’s primary calendar · read-only</span>
      </div>}
      {activityError && <div className="ic-notice" role="alert">Activities: {activityError}</div>}
      <section className="ic-detail" aria-label="Selected date details" aria-live="polite">
        <h3>{selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
        <button type="button" className="ic-day-open" onClick={() => setDayOpen(true)}>View day / + Add activity</button>
        {selectedActivities.length > 0 && <p>{selectedActivities.length} saved {selectedActivities.length === 1 ? "activity" : "activities"}</p>}
        {!selectedEvents.length && !selectedEntries.length && !selectedActivities.length && <p>{loading || entriesLoading ? "Loading this day…" : "No events or logbook entries for this day."}</p>}
        <div className="ic-detail-list">
          {selectedEvents.map(event => <div className="ic-detail-item" key={event.id}><i className="ic-google-dot" /><div><span className="ic-detail-type">Google Calendar · {event.all_day ? "All day" : `${time(event.start)} – ${time(event.end)}`}</span>{event.html_link?.startsWith("https://") ? <a href={event.html_link} target="_blank" rel="noopener noreferrer">{event.summary} ↗</a> : <strong>{event.summary}</strong>}{event.location && <span>{event.location}</span>}</div></div>)}
          {selectedEntries.map(entry => <div className="ic-detail-item" key={entry.id}><i className="ic-entry-dot" /><div><span className="ic-detail-type">Chronicles · {time(entry.created_at)}</span><strong>{entry.project_name}</strong><span>{Object.values(entry.data || {}).filter(value => typeof value === "string" || typeof value === "number").join(" · ")}</span></div></div>)}
        </div>
      </section>
      <div className="ic-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="ic-grid" aria-label="Month dates" aria-busy={loading || entriesLoading}>
        {days.map(day => {
          const key = dateKey(day), google = eventMap.get(key) || [], logs = entryMap.get(key) || []
          const dayActivities = activities.filter(activity => activity.day === key)
          const items = [
            ...dayActivities.map(activity => ({id: `a-${activity.id}`, kind: "activity", label: `${activity.all_day ? "All day" : activity.start_time} · ${activity.title}`})),
            ...google.map(event => ({ id: `g-${event.id}`, kind: "google", label: `${event.all_day ? "All day" : time(event.start)} · ${event.summary}` })),
            ...logs.map(entry => ({ id: `e-${entry.id}`, kind: "entry", label: `Log: ${entry.project_name}` })),
          ]
          return <button type="button" key={key} className={`ic-day ${day.getMonth() !== monthIndex ? "ic-outside" : ""} ${key === selectedKey ? "ic-selected" : ""}`} aria-pressed={key === selectedKey} aria-current={key === todayKey ? "date" : undefined} aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${google.length} Google events, ${logs.length} logbook entries, ${dayActivities.length} activities`} onClick={() => { setSelected(day); setDayOpen(true) }}>
            <span className={`ic-number ${key === todayKey ? "ic-today" : ""}`}>{day.getDate()}</span>
            <span className="ic-events">{items.slice(0, 3).map(item => <span key={item.id} className={`ic-event ic-${item.kind}`} title={item.label}>{item.label}</span>)}{items.length > 3 && <span className="ic-more">+{items.length - 3} more</span>}</span>
          </button>
        })}
      </div>

      {dayOpen && <DayActivityDialog key={selectedKey} date={selected} events={selectedEvents} entries={selectedEntries} activities={selectedActivities} loading={loading || entriesLoading || activitiesLoading} activityError={activityError} onClose={() => setDayOpen(false)} onSaved={activity => setActivities(items => [...items, activity])} onUpdated={activity => setActivities(items => items.map(item => item.id === activity.id ? activity : item))} onDeleted={id => setActivities(items => items.filter(item => item.id !== id))}
        onOpenEntry={projectFor && projects.length ? (entry => { if (projectFor(entry.project_id)) { setDayOpen(false); setOpenEntry(entry) } }) : undefined}
        onEditProject={onEditProject ? (id => { setDayOpen(false); onEditProject(id) }) : undefined}
        canManageProject={ownsProject}
        renderProjectDelete={renderProjectDelete ? (id => ownsProject(id) ? renderProjectDelete(projectFor(id), () => { setEntries(items => items.filter(item => item.project_id !== id)); setDayOpen(false) }) : null) : undefined} />}
      {openEntry && openEntryProject && <EntryDetailModal project={openEntryProject} entry={openEntry} projects={projects} entries={entries.filter(item => item.project_id === openEntryProject.id)} canManage={!openEntryProject.shared || (Boolean(userId) && openEntry.created_by === userId)}
        onClose={() => { setOpenEntry(null); setDayOpen(true) }}
        onSaved={saved => { setEntries(items => items.map(item => item.id === saved.id ? { ...item, ...saved } : item)); setOpenEntry(null); setDayOpen(true) }}
        onDeleted={id => { setEntries(items => items.filter(item => item.id !== id)); setOpenEntry(null); setDayOpen(true) }} />}
    </section>
  )
}
