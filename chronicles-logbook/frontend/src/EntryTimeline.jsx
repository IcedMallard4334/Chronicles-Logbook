import { useEffect, useMemo, useState } from "react"

import { fetchEntriesGlobal } from "./api"
import { humaniseValue } from "./fieldTypes"
import { SkeletonRows } from "./ViewTransition"
import "./EntryTimeline.css"

const PAGE_SIZE = 20

function populatedFields(entry) {
  const labels = new Map(
    (entry.schema_snapshot || []).map((field) => [field.id, field.name]),
  )

  return Object.entries(entry.data || {})
    .filter(([, value]) => (
      value !== null
      && value !== undefined
      && value !== ""
      && !(Array.isArray(value) && value.length === 0)
    ))
    .map(([id, value]) => ({
      id,
      label: labels.get(id) || "Recorded value",
      value: humaniseValue(value),
    }))
}

export default function EntryTimeline({ projects, onShowFieldTrends }) {
  const [query, setQuery] = useState("")
  const [projectId, setProjectId] = useState("")
  const [tag, setTag] = useState("")
  const [todo, setTodo] = useState("")
  const [sort, setSort] = useState("newest")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [page, setPage] = useState(1)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  // Seven filters are half a phone screen, so there they sit behind a button
  // (the button is hidden, and the filters always shown, on a wide screen).
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filtersActive = Boolean(query.trim() || projectId || tag.trim() || todo || start || end)
  const rangeError = start && end && start > end ? "Start date must be on or before end date." : ""

  useEffect(() => {
    if (rangeError) {
      setEntries([])
      setLoading(false)
      setError(rangeError)
      return undefined
    }

    let active = true
    setLoading(true)
    setError("")

    const timer = window.setTimeout(() => {
      fetchEntriesGlobal({
        q: query.trim() || undefined,
        projectId: projectId || undefined,
        tag: tag.trim() || undefined,
        todo: todo === "" ? undefined : todo === "true",
        start: start ? `${start}T00:00:00` : undefined,
        end: end ? `${end}T23:59:59.999` : undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      })
        .then((data) => {
          if (active) setEntries(data)
        })
        .catch((caught) => {
          if (active) {
            setEntries([])
            setError(caught instanceof Error ? caught.message : "Could not load the timeline.")
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 180)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, projectId, tag, todo, sort, start, end, page, retry, rangeError])

  const changeFilter = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  const grouped = useMemo(() => entries.map((entry) => ({
    entry,
    fields: populatedFields(entry),
  })), [entries])

  return (
    <section className="timeline" aria-label="Entry timeline">
      <header className="timeline-header timeline-title-row">
        <div>
          <h2>Activity</h2>
          <p>Browse your entries across all projects in chronological order.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onShowFieldTrends}>
          Field trends
        </button>
      </header>

      <button type="button" className="timeline-filters-toggle" aria-expanded={filtersOpen} aria-controls="timeline-filters" onClick={() => setFiltersOpen((open) => !open)}>
        {filtersOpen ? "Hide filters" : filtersActive ? "Filters (on)" : "Filters"}
      </button>
      <div className={`entry-timeline-filters${filtersOpen ? " is-open" : ""}`} id="timeline-filters" aria-label="Timeline filters">
        <label>
          Search
          <input
            type="search"
            placeholder="Search entries…"
            value={query}
            onChange={changeFilter(setQuery)}
          />
        </label>
        <label>
          Project
          <select value={projectId} onChange={changeFilter(setProjectId)}>
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <label>
          Tag
          <input type="search" placeholder="Any tag" value={tag} onChange={changeFilter(setTag)} />
        </label>
        <label>
          Status
          <select value={todo} onChange={changeFilter(setTodo)}>
            <option value="">Everything</option>
            <option value="true">Still to do</option>
            <option value="false">Already done</option>
          </select>
        </label>
        <label>
          Start date
          <input type="date" value={start} max={end || undefined} onChange={changeFilter(setStart)} />
        </label>
        <label>
          End date
          <input type="date" value={end} min={start || undefined} onChange={changeFilter(setEnd)} />
        </label>
        <label>
          Order
          <select value={sort} onChange={changeFilter(setSort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <div className="timeline-content" aria-busy={loading}>
        {error ? (
          <div className="workspace-error" role="alert">
            {error} {!rangeError && <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}
          </div>
        ) : loading ? (
          <SkeletonRows rows={6} height={96} label="Loading timeline" />
        ) : grouped.length === 0 ? (
          <div className="workspace-empty">
            <span className="workspace-empty-icon" aria-hidden="true">◷</span>
            <h3>{filtersActive ? "No entries match these filters" : "Your timeline is empty"}</h3>
            <p>{filtersActive ? "Try widening the date range or clearing a filter." : "Entries will appear here as you record work."}</p>
          </div>
        ) : (
          <ol className="timeline-list">
            {grouped.map(({ entry, fields }) => (
              <li key={entry.id} className="timeline-row">
                <div className="timeline-marker" aria-hidden="true" />
                <article>
                  <div className="timeline-meta">
                    <span className="timeline-project">{entry.project_name}</span>
                    <time className="timeline-time" dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {entry.title && <h3 className="timeline-entry-title">{entry.title}</h3>}
                  {fields.length ? (
                    <dl className="timeline-fields">
                      {fields.map((field) => (
                        <div key={field.id} className="timeline-field">
                          <dt className="timeline-label">{field.label}</dt>
                          <dd className="timeline-value">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="hint">No recorded field values.</p>}
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="workspace-pagination timeline-pagination">
        <span>Page {page}</span>
        <button type="button" className="btn-secondary" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <button type="button" className="btn-secondary" disabled={entries.length < PAGE_SIZE || loading || Boolean(error)} onClick={() => setPage((value) => value + 1)}>Next</button>
      </footer>
    </section>
  )
}
