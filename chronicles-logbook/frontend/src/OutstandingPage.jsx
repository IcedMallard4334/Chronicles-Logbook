import { useEffect, useMemo, useState } from "react"
import { fetchEntriesGlobal, updateEntry } from "./api"
import "./OutstandingPage.css"

// Buckets are ordered by how soon they need attention, so the list reads from
// the top as "deal with this first".
const BUCKETS = [
  { key: "overdue", label: "Overdue", note: "Past its due date." },
  { key: "today", label: "Due today", note: "Needs finishing today." },
  { key: "week", label: "Next 7 days", note: "Coming up this week." },
  { key: "later", label: "Later", note: "Further out." },
  { key: "undated", label: "No due date", note: "Outstanding, but never given a deadline." },
]

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Reads a date-only string as local midnight rather than UTC, so a due date
 *  never appears to slip a day for readers behind the meridian. */
const asLocalDate = (value) => new Date(`${value}T00:00:00`)

function bucketOf(entry, today) {
  if (!entry.due_date) return "undated"
  const days = Math.round((asLocalDate(entry.due_date) - today) / 86400000)
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  return days <= 7 ? "week" : "later"
}

function dueLabel(entry, today) {
  if (!entry.due_date) return "No date"
  const days = Math.round((asLocalDate(entry.due_date) - today) / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  if (days < 0) return `${Math.abs(days)} days ago`
  return asLocalDate(entry.due_date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
}

const displayValue = (entry) =>
  Object.values(entry.data || {})
    .filter(Boolean)
    .map((value) => (typeof value === "object" ? JSON.stringify(value) : String(value)))
    .join(" · ") || "No note content"

export default function OutstandingPage({ projects, onNavigate }) {
  const [projectId, setProjectId] = useState("")
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [clearing, setClearing] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    // The server does the ordering so it holds across the whole list rather
    // than only the slice already in the browser.
    fetchEntriesGlobal({
      todo: true,
      sort: "due_date",
      projectId: projectId || undefined,
      page: 1,
      pageSize: 100,
    })
      .then((data) => {
        if (active) setEntries(data)
      })
      .catch((caught) => {
        if (active) setError(caught.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, retry])

  // Fixed for the life of the view: the buckets only need to agree with each
  // other, and re-reading the clock on every render would rebuild the groups.
  const today = useMemo(() => startOfToday(), [])
  const grouped = useMemo(() => {
    const map = {}
    for (const bucket of BUCKETS) map[bucket.key] = []
    for (const entry of entries) map[bucketOf(entry, today)].push(entry)
    return map
  }, [entries, today])

  const markDone = async (entry) => {
    setClearing(entry.id)
    setError("")
    try {
      await updateEntry(entry.project_id, entry.id, { todo: false })
      // Dropped from the list rather than re-fetched: finished work has no
      // place in a view of what is still outstanding.
      setEntries((current) => current.filter((item) => item.id !== entry.id))
    } catch (caught) {
      setError(caught.message)
    } finally {
      setClearing(null)
    }
  }

  const overdue = grouped.overdue.length

  return (
    <section className="workspace-page" aria-label="Outstanding work workspace">
      <header className="workspace-heading">
        <div>
          <span className="workspace-eyebrow">WHAT STILL NEEDS DOING</span>
          <h1>Outstanding</h1>
          <p>Everything you marked as still to do, with the nearest deadline first.</p>
        </div>
        {overdue > 0 && (
          <p className="outstanding-alarm" role="status">
            {overdue} overdue
          </p>
        )}
      </header>

      <div className="workspace-filters">
        <label>
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <p className="workspace-muted">
          {loading
            ? "Gathering outstanding work…"
            : `${entries.length} item${entries.length === 1 ? "" : "s"} still open.`}
        </p>
      </div>

      <div className="workspace-body outstanding" aria-busy={loading}>
        {error ? (
          <div className="workspace-error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => setRetry((count) => count + 1)}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <p className="workspace-empty" role="status">
            Gathering outstanding work…
          </p>
        ) : !entries.length ? (
          <div className="workspace-empty">
            <span className="workspace-empty-icon">✓</span>
            <h2>Nothing outstanding</h2>
            <p>Mark an entry as still to do and it will wait for you here.</p>
            {onNavigate && (
              <button type="button" className="btn-primary" onClick={() => onNavigate("entries")}>
                Go to entries
              </button>
            )}
          </div>
        ) : (
          BUCKETS.filter((bucket) => grouped[bucket.key].length > 0).map((bucket) => (
            <section
              key={bucket.key}
              className={`outstanding-group is-${bucket.key}`}
              aria-label={`${bucket.label} (${grouped[bucket.key].length})`}
            >
              <header className="outstanding-group-head">
                <h2>{bucket.label}</h2>
                <span>{grouped[bucket.key].length}</span>
                <p>{bucket.note}</p>
              </header>
              <ul className="outstanding-list">
                {grouped[bucket.key].map((entry) => (
                  <li key={entry.id} className="outstanding-row">
                    <div className="outstanding-row-main">
                      <span className="outstanding-preview">{displayValue(entry)}</span>
                      <span className="workspace-project-label">{entry.project_name}</span>
                    </div>
                    <span className="outstanding-due">
                      {entry.due_date ? (
                        <time dateTime={entry.due_date}>{dueLabel(entry, today)}</time>
                      ) : (
                        dueLabel(entry, today)
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary outstanding-done"
                      disabled={clearing === entry.id}
                      onClick={() => markDone(entry)}
                    >
                      {clearing === entry.id ? "Saving…" : "Mark done"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  )
}
