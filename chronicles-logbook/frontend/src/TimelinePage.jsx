/**
 * The record, end to end.
 *
 * The brief puts this first among the things a logbook has to do: "above all
 * it should be a record, with a timeline to browse, a search across entries,
 * and a way to narrow to a single project". What stood under the old
 * "Activity" tab was a form for plotting one field against a date range —
 * useful, but a statistics tool wearing the name of a record, which is why
 * nobody could tell what the tab was for. The plotting has moved to
 * Statistics, where it belongs, and this is the browsable history.
 *
 * It is laid out as an alternating spine because that is what a timeline
 * looks like: a continuous line with dated markers on it and the events
 * hanging off either side. A chronological list is the same data and reads as
 * a feed — you can see the order, but not the shape, and the shape is what
 * tells you that March was busy and April was not. At phone width the spine
 * moves to the left edge and every card hangs off the same side, because two
 * columns in 390px is neither.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchEntriesGlobal } from "./api"
import {
  ValueView,
  columnsFor,
  entrySummary,
  entrySummaryField,
  isBlank,
  valuesFor,
} from "./entryValues"
import "./TimelinePage.css"

const PAGE_SIZE = 40

/** A project's own colour, derived from its id so it is stable and free. */
export function projectHue(projectId) {
  let hash = 0
  for (const character of String(projectId)) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360
  }
  return hash
}

function dayKey(value) {
  return String(value).slice(0, 10)
}

function friendlyDay(key) {
  const date = new Date(`${key}T00:00:00`)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (dayKey(today.toLocaleDateString("en-CA")) === key) return "Today"
  if (dayKey(yesterday.toLocaleDateString("en-CA")) === key) return "Yesterday"

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  })
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  if (!rest) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * One entry on the spine.
 *
 * Shows at most three fields: whichever the author filled in first. A card
 * that renders every field of a twelve-field schema is a table row with
 * rounded corners, and the point of this view is scanning.
 */
function TimelineEntry({ entry, project, projects, onOpen, side }) {
  const columns = useMemo(() => columnsFor(project || {}, [entry]), [project, entry])
  const values = useMemo(() => valuesFor(entry, project), [entry, project])
  const hue = projectHue(entry.project_id)

  // The field the title came from is not repeated underneath it. Showing it
  // twice was the first thing anybody noticed: the card read as a heading and
  // then the same sentence again, labelled.
  const titleField = entrySummaryField(entry, project?.entry_schema)
  const shown = columns
    .filter((column) => column.id !== titleField?.id && !isBlank(values[column.id]))
    .slice(0, 3)

  const duration = formatDuration(entry.time_spent)
  const time = new Date(entry.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <li className={`tl-item is-${side}`}>
      <span className="tl-node" style={{ "--project-hue": hue }} aria-hidden="true" />
      <button
        type="button"
        className={`tl-card ${entry.todo ? "is-todo" : ""}`}
        style={{ "--project-hue": hue }}
        onClick={() => onOpen(entry)}
        aria-label={`Open entry from ${entry.project_name || project?.name || "this project"}`}
      >
        <span className="tl-card-head">
          <span className="tl-project">{entry.project_name || project?.name}</span>
          <span className="tl-time">{time}</span>
        </span>

        <span className="tl-summary">{entrySummary(entry, project?.entry_schema)}</span>

        {shown.length > 0 && (
          <span className="tl-fields">
            {shown.map((column) => (
              <span key={column.id} className="tl-field">
                <span className="tl-field-name">{column.name}</span>
                <ValueView value={values[column.id]} field={column} projects={projects} />
              </span>
            ))}
          </span>
        )}

        <span className="tl-card-foot">
          {duration && <span className="tl-chip is-time">{duration}</span>}
          {entry.todo && <span className="tl-chip is-todo">Still to do</span>}
          {entry.due_date && (
            <span className="tl-chip">
              Due {new Date(`${entry.due_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          )}
          {entry.created_by_name && <span className="tl-chip is-who">{entry.created_by_name}</span>}
        </span>
      </button>
    </li>
  )
}

export default function TimelinePage({ projects, onOpenEntry, onOpenProject, onCreateProject }) {
  const [query, setQuery] = useState("")
  const [projectId, setProjectId] = useState("")
  const [entries, setEntries] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState("")
  const sentinel = useRef(null)

  const byId = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  )

  // A new search replaces the list; scrolling to the end appends to it. Both
  // go through here so there is one place that knows how a page is fetched.
  const load = useCallback(
    async (wanted, { append }) => {
      append ? setLoadingMore(true) : setLoading(true)
      setError("")
      try {
        const batch = await fetchEntriesGlobal({
          q: query || undefined,
          projectId: projectId || undefined,
          sort: "newest",
          page: wanted,
          pageSize: PAGE_SIZE,
        })
        setEntries((previous) => (append ? [...previous, ...batch] : batch))
        setExhausted(batch.length < PAGE_SIZE)
      } catch (caught) {
        setError(caught.message)
        setExhausted(true)
      } finally {
        append ? setLoadingMore(false) : setLoading(false)
      }
    },
    [query, projectId]
  )

  useEffect(() => {
    // Debounced, because this fires on every keystroke of the search box.
    const timer = setTimeout(() => {
      setPage(1)
      load(1, { append: false })
    }, 200)
    return () => clearTimeout(timer)
  }, [load])

  // Load the next page when the end of the list comes into view. A "load more"
  // button would work, but a record you are scrolling back through is the one
  // place where stopping to click is a genuine interruption.
  useEffect(() => {
    const node = sentinel.current
    if (!node || exhausted || loading || loadingMore) return undefined

    const observer = new IntersectionObserver(
      (records) => {
        if (records[0]?.isIntersecting) {
          const next = page + 1
          setPage(next)
          load(next, { append: true })
        }
      },
      { rootMargin: "320px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [exhausted, loading, loadingMore, page, load])

  // Grouped by the day they were written, which is how anybody looking for
  // "what did I do last Tuesday" searches by eye.
  const days = useMemo(() => {
    const grouped = new Map()
    for (const entry of entries) {
      const key = dayKey(entry.created_at)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(entry)
    }
    return [...grouped.entries()]
  }, [entries])

  const totalTime = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.time_spent || 0), 0),
    [entries]
  )

  let alternating = 0

  return (
    <section className="tl-page" aria-label="Timeline">
      <header className="tl-header">
        <div className="tl-header-copy">
          <span className="workspace-eyebrow">THE RECORD</span>
          <h1>Timeline</h1>
          <p>
            Everything you have written, newest first, grouped by the day it was
            written. Search it, or narrow it to one project.
          </p>
        </div>
        <div className="tl-header-stats">
          <span>
            <strong>
              {entries.length}
              {!exhausted && "+"}
            </strong>{" "}
            entries
          </span>
          <span>
            <strong>{formatDuration(totalTime) || "0m"}</strong> logged
          </span>
          <span>
            <strong>{days.length}</strong> {days.length === 1 ? "day" : "days"}
          </span>
        </div>
      </header>

      <div className="tl-filters">
        <label className="tl-search">
          <span className="sr-only">Search the record</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search everything you have written…"
          />
        </label>
        <label className="tl-filter">
          <span className="sr-only">Narrow to a project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Every project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        {(query || projectId) && (
          <button
            type="button"
            className="tl-clear"
            onClick={() => {
              setQuery("")
              setProjectId("")
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error ? (
        <div className="tl-empty" role="alert">
          <h2>That did not load</h2>
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => load(1, { append: false })}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="tl-skeleton" aria-label="Loading your record" role="status">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="tl-skeleton-row" style={{ animationDelay: `${row * 90}ms` }}>
              <span className="tl-skeleton-node" />
              <span className="tl-skeleton-card" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="tl-empty">
          <span className="tl-empty-mark" aria-hidden="true">
            ⌗
          </span>
          <h2>{query || projectId ? "Nothing matches that" : "Your record starts here"}</h2>
          <p>
            {query || projectId
              ? "Try another search, or widen it to every project."
              : "Open a project, define what an entry should hold, and write your first one. It will appear here."}
          </p>
          {!query && !projectId && projects.length === 0 && (
            <button type="button" className="btn-primary" onClick={onCreateProject}>
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="tl-spine">
          {days.map(([key, dayEntries]) => {
            const dayTime = dayEntries.reduce((sum, entry) => sum + (entry.time_spent || 0), 0)
            return (
              <section key={key} className="tl-day" aria-label={friendlyDay(key)}>
                <h2 className="tl-day-marker">
                  <span className="tl-day-label">{friendlyDay(key)}</span>
                  <span className="tl-day-meta">
                    {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"}
                    {dayTime > 0 && ` · ${formatDuration(dayTime)}`}
                  </span>
                </h2>
                <ul className="tl-list" role="list">
                  {dayEntries.map((entry) => {
                    // Alternation runs across the whole page rather than
                    // restarting per day, so the spine stays balanced instead
                    // of stacking every single-entry day on the left.
                    const side = alternating++ % 2 === 0 ? "left" : "right"
                    return (
                      <TimelineEntry
                        key={entry.id}
                        entry={entry}
                        project={byId.get(entry.project_id)}
                        projects={projects}
                        onOpen={onOpenEntry}
                        side={side}
                      />
                    )
                  })}
                </ul>
              </section>
            )
          })}

          <div ref={sentinel} className="tl-sentinel" aria-hidden="true" />

          {loadingMore && (
            <p className="tl-more" role="status">
              Reading further back…
            </p>
          )}
          {exhausted && entries.length > 0 && (
            <p className="tl-end">
              <span aria-hidden="true">●</span> That is the whole record
            </p>
          )}
        </div>
      )}
    </section>
  )
}
