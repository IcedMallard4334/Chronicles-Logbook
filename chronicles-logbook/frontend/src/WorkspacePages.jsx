import { useEffect, useMemo, useState } from "react"
import { fetchEntriesGlobal, fetchTasks } from "./api"
import { SavedFilterBar } from "./SavedFilterBar"
import { TaskPanel } from "./TaskPanel"
import {
  ValueView,
  columnsFor,
  entrySummary,
  entrySummaryField,
  isBlank,
  valuesFor,
} from "./entryValues"
import { SkeletonRows } from "./ViewTransition"
import { projectHue } from "./TimelinePage"
import "./WorkspacePages.css"

function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="workspace-heading">
      <div>
        <span className="workspace-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  )
}

// "project" orders the current page in the browser; the rest are orderings the
// search endpoint understands, so they hold across pages.
const SERVER_SORTS = ["newest", "oldest", "due_date"]
const PAGE_SIZE = 30

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  if (!rest) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * One row, expandable in place.
 *
 * The table used to show a single "Entry" column built by mashing every value
 * together with a separator — which for a rich schema produced
 * `reading,draft · [object Object] · 3`, and for anything else produced a
 * sentence with no labels on it. A row now leads with the entry's own title
 * and its first couple of fields properly rendered, and opens to show all of
 * them without leaving the table. Opening a row you were scanning should not
 * cost you your place in the list.
 */
function EntryRow({ entry, project, projects, selected, onToggleSelect, onOpen, onTag }) {
  const [expanded, setExpanded] = useState(false)
  const columns = useMemo(() => columnsFor(project || {}, [entry]), [project, entry])
  const values = useMemo(() => valuesFor(entry, project), [entry, project])
  // Not the field the title came from — it would read as the same sentence
  // twice, once as a heading and once labelled.
  const titleField = entrySummaryField(entry, project?.entry_schema)
  const filled = columns.filter(
    (column) => column.id !== titleField?.id && !isBlank(values[column.id])
  )
  const hue = projectHue(entry.project_id)
  const duration = formatDuration(entry.time_spent)

  return (
    <>
      <tr className={`we-row ${selected ? "is-selected" : ""} ${expanded ? "is-expanded" : ""}`}>
        <td className="we-pick">
          <input
            type="checkbox"
            aria-label={`Select ${entrySummary(entry, project?.entry_schema)}`}
            checked={selected}
            onChange={onToggleSelect}
          />
        </td>
        <td className="we-main">
          <button
            type="button"
            className="we-disclose"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse this entry" : "Show every field"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
          <span className="we-main-copy">
            <span className="we-title">{entrySummary(entry, project?.entry_schema)}</span>
            {/* At phone width the project, date, status and duration columns
                are hidden and reappear here, because a seven-column table in
                390px is not a table. One DOM, two layouts. */}
            <span className="we-compact-meta">
              <span className="we-project" style={{ "--project-hue": hue }}>
                {entry.project_name}
              </span>
              <time dateTime={entry.created_at}>
                {new Date(entry.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </time>
              {duration && <span>{duration}</span>}
              {entry.todo && <span className="we-flag">To do</span>}
            </span>
            {filled.length > 0 && (
              <span className="we-preview">
                {filled.slice(0, 2).map((column) => (
                  <span key={column.id} className="we-preview-field">
                    <span className="we-preview-name">{column.name}</span>
                    <ValueView value={values[column.id]} field={column} projects={projects} />
                  </span>
                ))}
                {filled.length > 2 && (
                  <span className="we-preview-more">+{filled.length - 2} more</span>
                )}
              </span>
            )}
          </span>
        </td>
        <td>
          <span className="we-project" style={{ "--project-hue": hue }}>
            {entry.project_name}
          </span>
        </td>
        <td>
          <time dateTime={entry.created_at}>
            {new Date(entry.created_at).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </time>
        </td>
        <td>{entry.todo ? <span className="we-flag">To do</span> : <span className="we-quiet">Done</span>}</td>
        <td className="we-time">{duration || "—"}</td>
        <td className="we-open">
          <button
            type="button"
            className="we-open-button"
            onClick={() => onOpen(entry)}
            aria-label="Open, correct or remove this entry"
            title="Open, correct or remove"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="we-detail-row">
          <td colSpan={7}>
            <dl className="we-detail">
              {columns.map((column) => (
                <div key={column.id} className={column.retired ? "is-retired" : ""}>
                  <dt>
                    {column.name}
                    {column.retired && <span className="we-retired-tag">no longer collected</span>}
                  </dt>
                  <dd>
                    {/* Tags are the one value worth making clickable here:
                        "show me everything tagged draft" is the question a tag
                        exists to answer, and it was previously unanswerable. */}
                    {column.type === "tags" && Array.isArray(values[column.id]) ? (
                      <span className="we-tag-row">
                        {values[column.id].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="we-tag"
                            onClick={() => onTag(tag)}
                            title={`Search for “${tag}”`}
                          >
                            {tag}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <ValueView value={values[column.id]} field={column} projects={projects} />
                    )}
                  </dd>
                </div>
              ))}
              {entry.created_by_name && (
                <div>
                  <dt>Logged by</dt>
                  <dd>{entry.created_by_name}</dd>
                </div>
              )}
              {entry.due_date && (
                <div>
                  <dt>Due</dt>
                  <dd>
                    {new Date(`${entry.due_date}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Every entry, across every project, as a table you can work in.
 *
 * What was here was a list you could look at and select rows in, and that was
 * the whole of it — no way to read an entry properly, correct one, or act on
 * what you found. It is now: rows open in place, any row opens the full entry
 * panel, a tag is a search you can run, a selection can be copied or exported,
 * and the summary line at the top says what the current filter actually
 * contains rather than making you count.
 */
export function EntriesPage({ projects, onCreate, onOpenEntry }) {
  const [query, setQuery] = useState("")
  const [projectId, setProjectId] = useState("")
  const [todo, setTodo] = useState("")
  const [page, setPage] = useState(1)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [sort, setSort] = useState("newest")
  const [selected, setSelected] = useState(new Set())
  const [copied, setCopied] = useState(false)

  const serverSort = SERVER_SORTS.includes(sort) ? sort : "newest"
  const byId = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    const timer = setTimeout(
      () =>
        fetchEntriesGlobal({
          q: query,
          projectId: projectId || undefined,
          todo: todo === "" ? undefined : todo === "true",
          sort: serverSort,
          page,
          pageSize: PAGE_SIZE,
        })
          .then((data) => {
            if (active) setEntries(data)
          })
          .catch((caught) => {
            if (active) setError(caught.message)
          })
          .finally(() => {
            if (active) setLoading(false)
          }),
      180
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, projectId, todo, serverSort, page, retry])

  const ordered = useMemo(
    () =>
      sort === "project"
        ? [...entries].sort((a, b) => String(a.project_name).localeCompare(String(b.project_name)))
        : entries,
    [entries, sort]
  )

  // The shape the saved-filter endpoint stores, and the shape applying one
  // hands back, so a re-applied filter restores every control below.
  const criteria = useMemo(
    () => ({
      q: query.trim() || null,
      project_id: projectId || null,
      todo: todo === "" ? null : todo === "true",
      sort: serverSort,
    }),
    [query, projectId, todo, serverSort]
  )

  const applySaved = (saved) => {
    setQuery(saved.q || "")
    setProjectId(saved.project_id || "")
    setTodo(saved.todo == null ? "" : String(saved.todo))
    setSort(saved.sort || "newest")
    setPage(1)
    setSelected(new Set())
  }

  const toggleAll = () =>
    setSelected(
      selected.size === ordered.length ? new Set() : new Set(ordered.map((entry) => entry.id))
    )

  const toggle = (id) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const chosen = ordered.filter((entry) => selected.has(entry.id))

  const asText = () =>
    chosen
      .map((entry) => {
        const project = byId.get(entry.project_id)
        const values = valuesFor(entry, project)
        const fields = columnsFor(project || {}, [entry])
          .filter((column) => !isBlank(values[column.id]))
          .map((column) => `  ${column.name}: ${String(values[column.id])}`)
          .join("\n")
        return `${entry.project_name} · ${new Date(entry.created_at).toLocaleString()}\n${fields}`
      })
      .join("\n\n")

  const copySelected = async () => {
    await navigator.clipboard.writeText(asText())
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const selectedTime = chosen.reduce((sum, entry) => sum + (entry.time_spent || 0), 0)
  const shownTime = ordered.reduce((sum, entry) => sum + (entry.time_spent || 0), 0)
  const filtered = Boolean(query || projectId || todo)

  return (
    <section className="workspace-page" aria-label="Entries workspace">
      <PageHeader
        eyebrow="YOUR WORK, RECORDED"
        title="Entries"
        description="Every entry across every project, searchable and correctable. For something you still need to do, use Tasks."
      >
        <button type="button" className="btn-primary" onClick={onCreate}>
          + Create project
        </button>
      </PageHeader>

      <div className="workspace-filters">
        <label className="workspace-search">
          Search entries
          <input
            type="search"
            placeholder="Search your own fields and project names…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Project
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={todo}
            onChange={(event) => {
              setTodo(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Everything</option>
            <option value="true">Still to do</option>
            <option value="false">Already done</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value)
              setPage(1)
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="due_date">Due date</option>
            <option value="project">Project name</option>
          </select>
        </label>
      </div>

      <SavedFilterBar criteria={criteria} onApply={applySaved} />

      {/* What the current filter actually contains. Counting rows by eye is
          exactly the work a table should be doing for you. */}
      {!loading && !error && ordered.length > 0 && (
        <p className="we-summary">
          <strong>{ordered.length}</strong> {ordered.length === 1 ? "entry" : "entries"}
          {filtered && " matching"}
          {shownTime > 0 && (
            <>
              {" · "}
              <strong>{formatDuration(shownTime)}</strong> logged
            </>
          )}
          {filtered && (
            <button
              type="button"
              className="we-clear"
              onClick={() => {
                setQuery("")
                setProjectId("")
                setTodo("")
                setPage(1)
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {selected.size > 0 && (
        <div className="workspace-bulkbar">
          <strong>{selected.size} selected</strong>
          <span>{formatDuration(selectedTime) || "no time"} logged between them.</span>
          <button type="button" onClick={copySelected}>
            {copied ? "Copied" : "Copy as text"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className="workspace-body workspace-table-wrap" aria-busy={loading}>
        {error ? (
          <div className="workspace-error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : loading ? (
          <SkeletonRows rows={5} height={56} label="Loading entries" />
        ) : !ordered.length ? (
          <div className="workspace-empty">
            <span className="workspace-empty-icon">≡</span>
            <h2>{filtered ? "No matching entries" : "Your story starts here"}</h2>
            <p>
              {filtered
                ? "Try another search, project or status."
                : "Open a project on Home to write your first logbook entry."}
            </p>
          </div>
        ) : (
          <table className="workspace-table we-table">
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="Select all entries"
                    type="checkbox"
                    checked={selected.size === ordered.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>Entry</th>
                <th>Project</th>
                <th>Recorded</th>
                <th>Status</th>
                <th>Time</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  project={byId.get(entry.project_id)}
                  projects={projects}
                  selected={selected.has(entry.id)}
                  onToggleSelect={() => toggle(entry.id)}
                  onOpen={onOpenEntry}
                  onTag={(tag) => {
                    setQuery(tag)
                    setPage(1)
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="workspace-pagination">
        <span>Page {page}</span>
        <button
          type="button"
          className="btn-secondary"
          disabled={page === 1 || loading}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={entries.length < PAGE_SIZE || loading || Boolean(error)}
          onClick={() => setPage((n) => n + 1)}
        >
          Next
        </button>
      </footer>
    </section>
  )
}

export function TasksPage({ projects, onCreate }) {
  const [chosen, setChosen] = useState("")
  const project = projects.find((item) => item.id === chosen) || projects[0]
  const [health, setHealth] = useState(null)

  useEffect(() => {
    let active = true
    if (!project) return undefined
    fetchTasks(project.id, false)
      .then((tasks) => {
        if (active) setHealth(tasks)
      })
      .catch(() => {
        if (active) setHealth([])
      })
    return () => {
      active = false
    }
  }, [project?.id])

  return (
    <section className="workspace-page" aria-label="Tasks workspace">
      <PageHeader
        eyebrow="A LITTLE PROGRESS, EVERY DAY"
        title="Tasks"
        description="What still needs doing on a project. For recording work already finished, use Entries."
      >
        <button type="button" className="btn-primary" onClick={onCreate}>
          + Create project
        </button>
      </PageHeader>

      {projects.length ? (
        <>
          <div className="workspace-filters">
            <label>
              Working on
              <select value={project.id} onChange={(event) => setChosen(event.target.value)}>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="workspace-muted">
              {health === null
                ? "Checking project health…"
                : health.length
                  ? `${health.length} open task${health.length === 1 ? "" : "s"} in this project.`
                  : "No open tasks — this project is clear."}
            </p>
          </div>
          <div className="workspace-body workspace-task-body">
            <TaskPanel key={project.id} projectId={project.id} />
          </div>
        </>
      ) : (
        <div className="workspace-empty">
          <span className="workspace-empty-icon">✓</span>
          <h2>Make room for your next idea</h2>
          <p>Create a project, then add tasks and track your progress here.</p>
          <button type="button" className="btn-primary" onClick={onCreate}>
            Create your first project
          </button>
        </div>
      )}
    </section>
  )
}
