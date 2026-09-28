import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchEntries, updateEntry } from "./api"
import { humaniseValue } from "./fieldTypes"
import "./BoardView.css"

// Grouping by whether the work is still outstanding is offered for every
// project, so a board is useful before anyone has defined a dropdown field.
const STATUS_GROUP = "__status__"
const STATUS_COLUMNS = [
  { key: "todo", label: "Still to do" },
  { key: "done", label: "Done" },
]
// Holds entries whose stored value is no longer one of the field's options,
// which happens when a dropdown is edited after entries were written. It is
// not a drop target: there is no value that would put an entry back into it.
const UNSORTED = "__unsorted__"

/**
 * How far along a checklist is — the count rather than the items, in the
 * same wording the entry list uses: a card has one line to spend.
 */
const checklistProgress = (value) => {
  const items = Array.isArray(value) ? value : []
  if (items.length === 0) return "—"
  const done = items.filter((item) => item && item.completed).length
  return `${done} of ${items.length} done`
}

/**
 * What a card says about the entry it holds.
 *
 * Each value is read against the entry's own schema snapshot — the project's
 * current schema may since have moved on — and written the way the rest of
 * the app writes a value that has one line to fit in: tags as words, a
 * checklist as its progress, links and project references as what they point
 * at. A stored value's JSON form is never shown; stringifying every
 * non-string value (which this used to do) put a checklist's raw shape on
 * the card.
 */
const preview = (entry, project, projectNames) => {
  const rowSchema = entry.schema_snapshot?.length
    ? entry.schema_snapshot
    : project?.entry_schema || []
  const types = new Map(rowSchema.map((field) => [field.id, field.type]))

  const values = Object.entries(entry.data || {})
    .filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    )
    .map(([id, value]) => {
      const type = types.get(id)
      if (type === "link") return "↳ linked entry"
      if (type === "checklist") return checklistProgress(value)
      if (type === "project_reference") {
        return projectNames.get(value) || "A project you no longer have"
      }
      return humaniseValue(value)
    })

  return values.join(" · ") || "No note content"
}

function groupingsFor(project) {
  const dropdowns = (project?.entry_schema || []).filter((field) => field.type === "dropdown")
  return [{ id: STATUS_GROUP, name: "Status" }, ...dropdowns]
}

function columnKeyOf(entry, grouping, columns) {
  if (grouping.id === STATUS_GROUP) return entry.todo ? "todo" : "done"
  const value = entry.data?.[grouping.id]
  return columns.some((column) => column.key === value) ? value : UNSORTED
}

/** The smallest update that moves an entry into the given column. */
function moveToColumn(entry, grouping, key) {
  if (grouping.id === STATUS_GROUP) return { todo: key === "todo" }
  // The whole map is sent because every field in a project's schema is
  // required, so a partial data object would be rejected as incomplete.
  return { data: { ...(entry.data || {}), [grouping.id]: key } }
}

export default function BoardView({ projects }) {
  const [chosen, setChosen] = useState("")
  const project = projects.find((item) => item.id === chosen) || projects[0]
  const projectNames = useMemo(
    () => new Map(projects.map((item) => [item.id, item.name])),
    [projects],
  )
  const groupings = useMemo(() => groupingsFor(project), [project])
  const [groupBy, setGroupBy] = useState(STATUS_GROUP)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)

  const grouping = groupings.find((item) => item.id === groupBy) || groupings[0]

  // A field chosen on one project rarely exists on the next, so fall back to
  // the grouping every project has rather than showing an empty board.
  useEffect(() => {
    if (!groupings.some((item) => item.id === groupBy)) setGroupBy(STATUS_GROUP)
  }, [groupings, groupBy])

  const load = useCallback(() => {
    if (!project) return undefined
    let active = true
    setLoading(true)
    setError("")
    fetchEntries(project.id)
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
  }, [project])

  useEffect(load, [load])

  const columns = useMemo(() => {
    if (!grouping) return []
    const defined =
      grouping.id === STATUS_GROUP
        ? STATUS_COLUMNS
        : (grouping.options || []).map((option) => ({ key: option, label: option }))
    const stray = entries.some((entry) => columnKeyOf(entry, grouping, defined) === UNSORTED)
    return stray ? [...defined, { key: UNSORTED, label: "Unsorted", fixed: true }] : defined
  }, [grouping, entries])

  const move = async (entry, key) => {
    if (!grouping || key === UNSORTED) return
    if (columnKeyOf(entry, grouping, columns) === key) return

    const patch = moveToColumn(entry, grouping, key)
    const previous = entries
    // Applied straight away so the card lands where it was dropped, then put
    // back if the server refuses the change.
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? { ...item, ...patch } : item)),
    )
    setError("")

    try {
      const saved = await updateEntry(project.id, entry.id, patch)
      setEntries((current) => current.map((item) => (item.id === entry.id ? saved : item)))
    } catch (caught) {
      setEntries(previous)
      setError(caught.message)
    }
  }

  if (!projects.length) {
    return (
      <section className="workspace-page" aria-label="Board workspace">
        <div className="workspace-empty">
          <span className="workspace-empty-icon">▤</span>
          <h2>Nothing to arrange yet</h2>
          <p>Create a project and log some entries to see them on a board.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="workspace-page" aria-label="Board workspace">
      <header className="workspace-heading">
        <div>
          <span className="workspace-eyebrow">SEE THE SHAPE OF THE WORK</span>
          <h1>Board</h1>
          <p>Group your entries by a field and drag them between columns.</p>
        </div>
      </header>

      <div className="workspace-filters">
        <label>
          Project
          <select value={project.id} onChange={(event) => setChosen(event.target.value)}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Group by
          <select value={grouping?.id} onChange={(event) => setGroupBy(event.target.value)}>
            {groupings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="board-error workspace-error" role="alert">
          {error}
        </p>
      )}

      <div className="workspace-body board" aria-busy={loading}>
        {loading ? (
          <p className="workspace-empty" role="status">
            Loading board…
          </p>
        ) : (
          <div className="board-columns">
            {columns.map((column) => {
              const held = entries.filter(
                (entry) => columnKeyOf(entry, grouping, columns) === column.key,
              )
              return (
                <section
                  key={column.key}
                  className={`board-column ${over === column.key ? "is-over" : ""}`}
                  aria-label={`${column.label} (${held.length})`}
                  onDragOver={(event) => {
                    if (column.fixed) return
                    // Without this the browser rejects the drop outright.
                    event.preventDefault()
                    setOver(column.key)
                  }}
                  onDragLeave={() => setOver((current) => (current === column.key ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    setOver(null)
                    const dropped = entries.find((entry) => entry.id === dragging)
                    if (dropped) move(dropped, column.key)
                    setDragging(null)
                  }}
                >
                  <header className="board-column-head">
                    <h2>{column.label}</h2>
                    <span>{held.length}</span>
                  </header>
                  <ul className="board-cards">
                    {held.map((entry) => (
                      <li
                        key={entry.id}
                        className={`board-card ${dragging === entry.id ? "is-dragging" : ""}`}
                        draggable
                        onDragStart={() => setDragging(entry.id)}
                        onDragEnd={() => {
                          setDragging(null)
                          setOver(null)
                        }}
                      >
                        {entry.title && <p className="board-card-title">{entry.title}</p>}
                        <p className="board-card-preview">{preview(entry, project, projectNames)}</p>
                        <footer className="board-card-meta">
                          <time dateTime={entry.created_at}>
                            {new Date(entry.created_at).toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                            })}
                          </time>
                          {/* A dropdown alongside the drag handle, so the board
                              can also be used from the keyboard. */}
                          <label className="board-card-move">
                            Move to
                            <select
                              value={columnKeyOf(entry, grouping, columns)}
                              onChange={(event) => move(entry, event.target.value)}
                            >
                              {columns.map((option) => (
                                <option
                                  key={option.key}
                                  value={option.key}
                                  disabled={option.fixed}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </footer>
                      </li>
                    ))}
                  </ul>
                  {!held.length && <p className="board-column-empty">Nothing here yet.</p>}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
