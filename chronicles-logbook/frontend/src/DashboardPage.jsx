import { useEffect, useMemo, useRef, useState } from "react"
import {
  fetchDashboard,
  updateDashboardPanels,
  fetchSavedFilters,
  fetchEntries,
  fetchEntriesGlobal,
  fetchStatistics,
  fetchFieldTimeline,
} from "./api"
import "./DashboardPage.css"

function newPanelId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const PANEL_TYPE_LABELS = {
  statistic: "Statistic",
  saved_filter: "Saved filter",
  board: "Board",
}

const MIN_COLUMNS = 2
const MAX_COLUMNS = 6
const DEFAULT_COLUMNS = 3
const HEIGHTS = [
  { value: 1, label: "Short" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Tall" },
  { value: 4, label: "Extra tall" },
]

const STATISTIC_VIEWS = [
  { value: "overview", label: "Overview totals" },
  { value: "project_breakdown", label: "Per-project breakdown" },
  { value: "field_timeline", label: "A field over time" },
]

function defaultTitleFor(panel, { projects, savedFilters }) {
  if (panel.title) return panel.title
  if (panel.type === "saved_filter") {
    return savedFilters.find((item) => item.id === panel.config.filter_id)?.name || "Saved filter"
  }
  if (panel.type === "board") {
    return projects.find((item) => item.id === panel.config.project_id)?.name
      ? `${projects.find((item) => item.id === panel.config.project_id).name} board`
      : "Board"
  }
  return STATISTIC_VIEWS.find((item) => item.value === panel.config.view)?.label || "Statistic"
}

// ---- Panel bodies: each fetches only what it needs, on its own ----

function StatisticPanelBody({ config }) {
  const [stats, setStats] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [error, setError] = useState(null)
  const isTimeline = config.view === "field_timeline"

  useEffect(() => {
    let cancelled = false
    setError(null)
    setStats(null)
    setTimeline(null)

    if (isTimeline) {
      if (!config.project_id || !config.field_id) {
        setError("This panel is missing a project or field.")
        return undefined
      }
      fetchFieldTimeline(config.project_id, config.field_id)
        .then((data) => { if (!cancelled) setTimeline(data) })
        .catch(() => { if (!cancelled) setError("Could not load this statistic.") })
    } else {
      fetchStatistics()
        .then((data) => { if (!cancelled) setStats(data) })
        .catch(() => { if (!cancelled) setError("Could not load this statistic.") })
    }

    return () => { cancelled = true }
  }, [isTimeline, config.project_id, config.field_id])

  if (error) return <p className="dashboard-panel-error">{error}</p>

  if (isTimeline) {
    if (!timeline) return <p className="hint">Loading…</p>
    const recent = timeline.points.slice(-8)
    return (
      <div className="dashboard-stat-timeline">
        {recent.length === 0 && <p className="hint">No entries yet for this field.</p>}
        <ul>
          {recent.map((point) => (
            <li key={point.entry_id}>
              <span>{new Date(point.created_at).toLocaleDateString()}</span>
              <strong>{String(point.value)}</strong>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!stats) return <p className="hint">Loading…</p>

  if (config.view === "project_breakdown") {
    return (
      <ul className="dashboard-stat-list">
        {stats.projects.length === 0 && <p className="hint">No projects yet.</p>}
        {stats.projects.map((project) => (
          <li key={project.project_id}>
            <span>{project.name}</span>
            <strong>{project.entries} {project.entries === 1 ? "entry" : "entries"}</strong>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="dashboard-stat-grid">
      <div><strong>{stats.totals.entries}</strong><span>Entries</span></div>
      <div><strong>{stats.totals.active_projects}</strong><span>Active projects</span></div>
      <div><strong>{stats.totals.active_days}</strong><span>Active days</span></div>
      <div><strong>{Math.round(stats.totals.time_spent / 60)}h</strong><span>Logged</span></div>
    </div>
  )
}

function SavedFilterPanelBody({ config, savedFilters }) {
  const filter = savedFilters.find((item) => item.id === config.filter_id)
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!filter) return undefined
    let cancelled = false
    fetchEntriesGlobal({
      q: filter.criteria.q,
      projectId: filter.criteria.project_id,
      todo: filter.criteria.todo,
      sort: filter.criteria.sort,
      pageSize: 5,
    })
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setError("Could not load this filter's results.") })
    return () => { cancelled = true }
  }, [filter])

  if (!filter) return <p className="dashboard-panel-error">This saved filter no longer exists.</p>
  if (error) return <p className="dashboard-panel-error">{error}</p>
  if (!entries) return <p className="hint">Loading…</p>

  return (
    <ul className="dashboard-entry-list">
      {entries.length === 0 && <p className="hint">No matching entries.</p>}
      {entries.map((entry) => (
        <li key={entry.id}>
          <span>{entry.project_name}</span>
          <p>{Object.values(entry.data || {}).filter(Boolean).join(" · ") || "No note content"}</p>
        </li>
      ))}
    </ul>
  )
}

function BoardPanelBody({ config, projects }) {
  const project = projects.find((item) => item.id === config.project_id)
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!project) return undefined
    let cancelled = false
    fetchEntries(project.id)
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setError("Could not load this board.") })
    return () => { cancelled = true }
  }, [project])

  if (!project) return <p className="dashboard-panel-error">This project is no longer available.</p>
  if (error) return <p className="dashboard-panel-error">{error}</p>
  if (!entries) return <p className="hint">Loading…</p>

  const grouping = config.grouping || "__status__"
  const isStatus = grouping === "__status__"
  const field = isStatus ? null : (project.entry_schema || []).find((item) => item.id === grouping)
  const columns = isStatus
    ? [{ key: "todo", label: "Still to do" }, { key: "done", label: "Done" }]
    : (field?.options || []).map((option) => ({ key: option, label: option }))

  return (
    <ul className="dashboard-board-summary">
      {columns.map((column) => (
        <li key={column.key}>
          <span>{column.label}</span>
          <strong>
            {entries.filter((entry) => {
              const value = isStatus ? (entry.todo ? "todo" : "done") : entry.data?.[grouping]
              return value === column.key
            }).length}
          </strong>
        </li>
      ))}
    </ul>
  )
}

function PanelBody({ panel, projects, savedFilters }) {
  if (panel.type === "saved_filter") return <SavedFilterPanelBody config={panel.config} savedFilters={savedFilters} />
  if (panel.type === "board") return <BoardPanelBody config={panel.config} projects={projects} />
  return <StatisticPanelBody config={panel.config} />
}

// ---- Adding a panel ----

function AddPanelForm({ projects, savedFilters, columns, onAdd, onCancel }) {
  const [width, setWidth] = useState(1)
  const [height, setHeight] = useState(2)
  const [type, setType] = useState("statistic")
  const [view, setView] = useState("overview")
  const [projectId, setProjectId] = useState(projects[0]?.id || "")
  const [fieldId, setFieldId] = useState("")
  const [grouping, setGrouping] = useState("__status__")
  const [filterId, setFilterId] = useState(savedFilters[0]?.id || "")

  const project = projects.find((item) => item.id === projectId)
  const numericOrTextFields = useMemo(
    () => (project?.entry_schema || []).filter((field) => field.type !== "computed"),
    [project]
  )
  const dropdownFields = useMemo(
    () => (project?.entry_schema || []).filter((field) => field.type === "dropdown"),
    [project]
  )

  const canSubmit =
    type === "saved_filter"
      ? Boolean(filterId)
      : type === "board"
      ? Boolean(projectId)
      : view !== "field_timeline" || (projectId && fieldId)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!canSubmit) return

    const config =
      type === "saved_filter"
        ? { filter_id: filterId }
        : type === "board"
        ? { project_id: projectId, grouping }
        : view === "field_timeline"
        ? { view, project_id: projectId, field_id: fieldId }
        : { view }

    onAdd({ id: newPanelId(), type, config, w: Math.min(width, columns), h: height })
  }

  return (
    <form className="dashboard-add-panel" onSubmit={handleSubmit}>
      <label>
        Panel type
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {Object.entries(PANEL_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      {type === "statistic" && (
        <>
          <label>
            Which statistic
            <select value={view} onChange={(event) => setView(event.target.value)}>
              {STATISTIC_VIEWS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          {view === "field_timeline" && (
            <>
              <label>
                Project
                <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setFieldId("") }}>
                  <option value="">Choose a project…</option>
                  {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                Field
                <select value={fieldId} onChange={(event) => setFieldId(event.target.value)} disabled={!project}>
                  <option value="">Choose a field…</option>
                  {numericOrTextFields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
                </select>
              </label>
            </>
          )}
        </>
      )}

      {type === "saved_filter" && (
        savedFilters.length === 0 ? (
          <p className="hint">You don't have any saved filters yet.</p>
        ) : (
          <label>
            Saved filter
            <select value={filterId} onChange={(event) => setFilterId(event.target.value)}>
              {savedFilters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )
      )}

      {type === "board" && (
        <>
          <label>
            Project
            <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setGrouping("__status__") }}>
              <option value="">Choose a project…</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Group by
            <select value={grouping} onChange={(event) => setGrouping(event.target.value)} disabled={!project}>
              <option value="__status__">Status</option>
              {dropdownFields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>
        </>
      )}

      <div className="dashboard-add-panel-size">
        <label>
          Width
          <select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {Array.from({ length: columns }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value} {value === 1 ? "block" : "blocks"} wide</option>
            ))}
          </select>
        </label>
        <label>
          Height
          <select value={height} onChange={(event) => setHeight(Number(event.target.value))}>
            {HEIGHTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="dashboard-add-panel-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!canSubmit}>Add panel</button>
      </div>
    </form>
  )
}

// ---- The page itself ----

export default function DashboardPage({ projects }) {
  const [panels, setPanels] = useState(null)
  const [savedFilters, setSavedFilters] = useState([])
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDashboard(), fetchSavedFilters()])
      .then(([dashboard, filters]) => {
        if (cancelled) return
        setPanels(dashboard.panels)
        setColumns(dashboard.columns || DEFAULT_COLUMNS)
        setSavedFilters(filters)
      })
      .catch((caught) => { if (!cancelled) setError(caught.message) })
    return () => { cancelled = true }
  }, [])

  const persist = async (nextPanels, nextColumns) => {
    setPanels(nextPanels)
    if (nextColumns !== undefined) setColumns(nextColumns)
    setSaving(true)
    try {
      const dashboard = nextColumns === undefined
        ? await updateDashboardPanels(nextPanels)
        : await updateDashboardPanels(nextPanels, nextColumns)
      setPanels(dashboard.panels)
      if (dashboard.columns) setColumns(dashboard.columns)
      setError(null)
    } catch (caught) {
      setError("Could not save your dashboard. Your changes may not have stuck — try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = (panel) => {
    setAdding(false)
    persist([...panels, panel])
  }

  const handleRemove = (panelId) => {
    persist(panels.filter((panel) => panel.id !== panelId))
  }

  const handleResize = (panelId, change) => {
    persist(panels.map((panel) => (panel.id === panelId ? { ...panel, ...change } : panel)))
  }

  const handleColumns = (count) => {
    persist(panels.map((panel) => ({ ...panel, w: Math.min(panel.w || 1, count) })), count)
  }

  // Dragging is done with pointer events on the grip, so the same code serves a
  // mouse, a finger and a pen. `touch-action: none` on the grip (see the CSS)
  // stops the browser scrolling instead while a finger is on it.
  const overIdRef = useRef(null)
  overIdRef.current = overId

  const startDrag = (event, panelId) => {
    if (saving) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragId(panelId)
  }

  useEffect(() => {
    if (!dragId) return undefined
    const panelUnder = (x, y) => document.elementFromPoint?.(x, y)?.closest?.("[data-panel-id]")?.dataset.panelId || null
    const move = (event) => {
      setOverId(panelUnder(event.clientX, event.clientY))
      // Near the top or bottom of the window, scroll so a long dashboard can be reached mid-drag.
      if (event.clientY < 60) window.scrollBy?.(0, -14)
      else if (event.clientY > window.innerHeight - 60) window.scrollBy?.(0, 14)
    }
    const finish = (event) => {
      const target = event.type === "pointerup" ? panelUnder(event.clientX, event.clientY) || overIdRef.current : null
      handleDrop(dragId, target)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
    }
    // handleDrop reads the current panels; re-binding per drag is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, panels])

  const handleDrop = (sourceId, targetId) => {
    setDragId(null)
    setOverId(null)
    if (!sourceId || !targetId || sourceId === targetId) return
    const from = panels.findIndex((panel) => panel.id === sourceId)
    const to = panels.findIndex((panel) => panel.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...panels]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persist(next)
  }

  const handleMove = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= panels.length) return
    const next = [...panels]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  if (panels === null) {
    return (
      <section className="dashboard-page workspace-page" aria-label="Dashboard workspace">
        <p className="workspace-empty" role="status">Loading your dashboard…</p>
      </section>
    )
  }

  return (
    <section className="dashboard-page workspace-page" aria-labelledby="dashboard-title">
      <header className="workspace-heading">
        <div>
          <span className="workspace-eyebrow">ONE VIEW OF WHAT MATTERS</span>
          <h1 id="dashboard-title">My dashboard</h1>
          <p>Arrange the statistics and views that matter to you.</p>
        </div>
        <div className="dashboard-header-actions">
          <label className="dashboard-columns">
            Blocks across
            <select
              value={columns}
              disabled={saving}
              onChange={(event) => handleColumns(Number(event.target.value))}
            >
              {Array.from({ length: MAX_COLUMNS - MIN_COLUMNS + 1 }, (_, index) => index + MIN_COLUMNS).map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
          {!adding && (
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
              + Add panel
            </button>
          )}
        </div>
      </header>

      <div className="workspace-body">
        {error && <p className="workspace-error" role="alert">{error}</p>}

        {adding && (
          <AddPanelForm
            projects={projects}
            savedFilters={savedFilters}
            columns={columns}
            onAdd={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}

        {panels.length === 0 && !adding ? (
          <div className="workspace-empty">
            <span className="workspace-empty-icon">▦</span>
            <h2>Your dashboard is empty</h2>
            <p>Add a panel to see your statistics, saved filters, or boards at a glance.</p>
          </div>
        ) : (
          <ul className="dashboard-panel-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {panels.map((panel, index) => (
              <li
                className={`dashboard-panel${dragId === panel.id ? " is-dragging" : ""}${overId === panel.id && dragId !== panel.id ? " is-drop-target" : ""}`}
                key={panel.id}
                data-panel-id={panel.id}
                style={{ gridColumn: `span ${Math.min(panel.w || 1, columns)}`, gridRow: `span ${panel.h || 2}` }}
              >
                <header className="dashboard-panel-header">
                  <span>
                    <span className="dashboard-panel-type">{PANEL_TYPE_LABELS[panel.type]}</span>
                    <strong>{defaultTitleFor(panel, { projects, savedFilters })}</strong>
                  </span>
                  <div className="dashboard-panel-controls">
                    <button
                      type="button"
                      className="dashboard-panel-grip"
                      aria-label="Drag to rearrange panel"
                      title="Drag to rearrange"
                      disabled={saving}
                      onPointerDown={(event) => startDrag(event, panel.id)}
                    >
                      ⠿
                    </button>
                    <select
                      aria-label="Panel width"
                      value={Math.min(panel.w || 1, columns)}
                      disabled={saving}
                      onChange={(event) => handleResize(panel.id, { w: Number(event.target.value) })}
                    >
                      {Array.from({ length: columns }, (_, i) => i + 1).map((value) => (
                        <option key={value} value={value}>{value} wide</option>
                      ))}
                    </select>
                    <select
                      aria-label="Panel height"
                      value={panel.h || 2}
                      disabled={saving}
                      onChange={(event) => handleResize(panel.id, { h: Number(event.target.value) })}
                    >
                      {HEIGHTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <button
                      type="button"
                      aria-label="Move panel up"
                      disabled={index === 0 || saving}
                      onClick={() => handleMove(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move panel down"
                      disabled={index === panels.length - 1 || saving}
                      onClick={() => handleMove(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Remove panel"
                      disabled={saving}
                      onClick={() => handleRemove(panel.id)}
                    >
                      ×
                    </button>
                  </div>
                </header>
                <div className="dashboard-panel-body">
                  <PanelBody panel={panel} projects={projects} savedFilters={savedFilters} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
