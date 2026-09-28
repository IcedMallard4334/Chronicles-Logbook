import { useEffect, useMemo, useState } from "react"
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

function AddPanelForm({ projects, savedFilters, onAdd, onCancel }) {
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

    onAdd({ id: newPanelId(), type, config })
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

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchDashboard(), fetchSavedFilters()])
      .then(([dashboard, filters]) => {
        if (cancelled) return
        setPanels(dashboard.panels)
        setSavedFilters(filters)
      })
      .catch((caught) => { if (!cancelled) setError(caught.message) })
    return () => { cancelled = true }
  }, [])

  const persist = async (nextPanels) => {
    setPanels(nextPanels)
    setSaving(true)
    try {
      const dashboard = await updateDashboardPanels(nextPanels)
      setPanels(dashboard.panels)
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

  const handleMove = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= panels.length) return
    const next = [...panels]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  if (panels === null) {
    return (
      <section className="dashboard-page workspace-page">
        <p className="hint">Loading your dashboard…</p>
      </section>
    )
  }

  return (
    <section className="dashboard-page workspace-page" aria-labelledby="dashboard-title">
      <header className="dashboard-page-header">
        <div>
          <h1 id="dashboard-title">My dashboard</h1>
          <p>Arrange the statistics and views that matter to you.</p>
        </div>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            + Add panel
          </button>
        )}
      </header>

      {error && <p className="dashboard-panel-error" role="alert">{error}</p>}

      {adding && (
        <AddPanelForm
          projects={projects}
          savedFilters={savedFilters}
          onAdd={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {panels.length === 0 && !adding && (
        <div className="dashboard-empty">
          <p>Your dashboard is empty. Add a panel to see your statistics, saved filters, or boards at a glance.</p>
        </div>
      )}

      <ul className="dashboard-panel-grid">
        {panels.map((panel, index) => (
          <li className="dashboard-panel" key={panel.id}>
            <header className="dashboard-panel-header">
              <span>
                <span className="dashboard-panel-type">{PANEL_TYPE_LABELS[panel.type]}</span>
                <strong>{defaultTitleFor(panel, { projects, savedFilters })}</strong>
              </span>
              <div className="dashboard-panel-controls">
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
    </section>
  )
}
