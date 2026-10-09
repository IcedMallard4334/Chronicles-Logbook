import { Fragment, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  createCustomStatistic,
  deleteCustomStatistic,
  fetchCustomStatistics,
  fetchStatistics,
  fetchStatisticsActivity,
  fetchStatisticsLayout,
  previewCustomStatistic,
  saveStatisticsLayout,
  updateCustomStatistic,
} from "./api"
import FieldStatisticsPanel from "./FieldStatisticsPanel"
import FieldTimeline from "./FieldTimeline"
import { formatDuration } from "./formatDuration"
import { useDialogFocus } from "./useDialogFocus"
import { SkeletonRows } from "./ViewTransition"

import "./StatisticsPage.css"
import { TrashButton } from "./TrashIcon"
import { EditButton } from "./EditIcon"

/** The panels the Customise drawer can show, hide and reorder. */
const PANEL_LABELS = {
  cards: "Headline cards",
  time: "Where your time went",
  activity: "Your activity",
  custom: "My stats",
  fields: "Look inside a project",
  trend: "A field over time",
}

/** The arrangement a fresh account — or a reset — starts from. */
const DEFAULT_LAYOUT = [
  { id: "cards", visible: true },
  { id: "time", visible: true },
  { id: "activity", visible: true },
  { id: "custom", visible: true },
  { id: "fields", visible: true },
  { id: "trend", visible: false },
]

const ACTIVITY_WEEKS = 12

const chartTooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
}

const weekLabel = (weekStart, withYear = false) =>
  new Date(`${weekStart}T00:00:00`).toLocaleDateString(
    undefined,
    withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" },
  )

/** The plain-English word for each thing a formula can work out, and the
 * function the sentence builder writes for it. "sum" reads as "Total"
 * because that is what a person says. */
const AGGREGATE_FUNCTIONS = {
  Average: "avg",
  Total: "sum",
  Highest: "max",
  Lowest: "min",
  Count: "count",
}

/** The shapes the sentence builder writes, read back out of a saved formula
 * so editing one reopens the builder in the shape that made it. */
const SIMPLE_FORMULA = /^(avg|sum|min|max)\(\s*\{([^{}]+)\}\s*\)$/

const formatStatValue = (value) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
}).format(value)

export default function StatisticsPage({ projects, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState(null)
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)

  const [customiseOpen, setCustomiseOpen] = useState(false)
  const [draft, setDraft] = useState(DEFAULT_LAYOUT)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [showTimeTable, setShowTimeTable] = useState(false)
  const [showActivityTable, setShowActivityTable] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")

    Promise.all([fetchStatistics(), fetchStatisticsActivity(ACTIVITY_WEEKS)])
      .then(([statsData, activityData]) => {
        if (!active) return
        setStats(statsData)
        setActivity(activityData)
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your statistics.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    // The layout is a preference, not content: if it cannot be read the page
    // still works from the default arrangement, so it fails quietly rather
    // than taking the numbers down with it.
    fetchStatisticsLayout()
      .then((panels) => {
        if (active && Array.isArray(panels)) setLayout(panels)
      })
      .catch(() => {})

    return () => { active = false }
  }, [retry])

  // The project picker for "Look inside a project" starts on whichever
  // project was written in most recently, so the panel usually opens on
  // something worth looking at.
  const recentProjects = useMemo(() => {
    const lastEntryByProject = new Map(
      (stats?.projects || []).map((project) => [project.project_id, project.last_entry_at]),
    )
    return [...projects].sort((a, b) =>
      String(lastEntryByProject.get(b.id) || "").localeCompare(String(lastEntryByProject.get(a.id) || "")),
    )
  }, [projects, stats])

  const [fieldsProjectId, setFieldsProjectId] = useState("")

  useEffect(() => {
    const ids = new Set(projects.map((project) => project.id))
    if (!fieldsProjectId || !ids.has(fieldsProjectId)) {
      setFieldsProjectId(recentProjects[0]?.id || "")
    }
  }, [projects, recentProjects, fieldsProjectId])

  const fieldsProject = projects.find((project) => project.id === fieldsProjectId) || null

  const timeRows = useMemo(() => (stats?.projects || [])
    .filter((project) => !project.archived && project.time_spent > 0)
    .sort((a, b) => b.time_spent - a.time_spent)
    .map((project) => ({ name: project.name, minutes: project.time_spent })), [stats])

  const timeTotal = timeRows.reduce((sum, row) => sum + row.minutes, 0)

  const activityRows = useMemo(() => (activity?.weeks || []).map((week) => ({
    key: week.week_start,
    label: weekLabel(week.week_start),
    entries: week.entries,
  })), [activity])

  const lastWeekEntries = activityRows.length ? activityRows[activityRows.length - 1].entries : 0
  const busiestWeekday = activity?.busiest_weekday || null

  const openCustomise = () => {
    setDraft(layout)
    setSaveError("")
    setCustomiseOpen(true)
  }

  const toggleDraftPanel = (id) => {
    setDraft((current) => current.map((panel) =>
      panel.id === id ? { ...panel, visible: !panel.visible } : panel,
    ))
  }

  const moveDraftPanel = (index, direction) => {
    setDraft((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const persistLayout = async (panels) => {
    setSaving(true)
    setSaveError("")
    try {
      const saved = await saveStatisticsLayout(panels)
      setLayout(Array.isArray(saved) ? saved : panels)
      setCustomiseOpen(false)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save your layout.")
    } finally {
      setSaving(false)
    }
  }

  const totals = stats?.totals
  const isEmpty = totals ? totals.entries === 0 : false

  const panels = {
    cards: (
      <section className="stats-panel stats-cards-panel" aria-label="Headline cards">
        <h2 className="sr-only">Headline cards</h2>
        <div className="stats-cards">
          <StatCard
            label="Time logged"
            value={totals ? formatDuration(totals.time_spent) : "—"}
            help="The time you have recorded across every entry, in hours and minutes."
            helpLabel="What is time logged?"
          />
          <StatCard
            label="Entries"
            value={totals ? totals.entries : "—"}
            help="How many entries you have written across all of your projects."
            helpLabel="What are entries?"
          />
          <StatCard
            label="Active days"
            value={totals ? totals.active_days : "—"}
            help="How many different days you have written something on."
            helpLabel="What are active days?"
          />
          <StatCard
            label="Day streak"
            value={totals ? totals.current_streak : "—"}
            sub={totals ? `Best: ${totals.longest_streak} ${totals.longest_streak === 1 ? "day" : "days"}` : undefined}
            help="How many days in a row you have written something, up to today."
            helpLabel="What is the day streak?"
          />
        </div>
      </section>
    ),
    time: (
      <section className="stats-panel" aria-labelledby="stats-time-heading">
        <header className="stats-panel-head">
          <h2 id="stats-time-heading">Where your time went</h2>
          <TableViewToggle open={showTimeTable} onToggle={() => setShowTimeTable((open) => !open)} />
        </header>
        {timeRows.length === 0 ? (
          <p className="stats-hint">No time recorded yet. Add how long an entry took and this chart will fill in.</p>
        ) : (
          <>
            <p className="stats-takeaway">
              <strong>{timeRows[0].name}</strong> took{" "}
              {timeTotal ? Math.round((timeRows[0].minutes / timeTotal) * 100) : 0}% of your time.
            </p>
            {showTimeTable ? (
              <table className="stats-table">
                <caption className="sr-only">Time logged per project</caption>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Time logged</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {timeRows.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{formatDuration(row.minutes)}</td>
                      <td>{timeTotal ? `${Math.round((row.minutes / timeTotal) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="stats-chart" role="img" aria-label="Time logged per project">
                <ResponsiveContainer width="100%" height={Math.max(160, timeRows.length * 46)}>
                  <BarChart data={timeRows} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="var(--line)"
                      tick={{ fill: "var(--muted)", fontSize: 12 }}
                      tickFormatter={(value) => formatDuration(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      stroke="var(--line)"
                      tick={{ fill: "var(--text)", fontSize: 12 }}
                      tickFormatter={(name) => (name.length > 20 ? `${name.slice(0, 19)}…` : name)}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(value) => [formatDuration(value), "Time logged"]}
                    />
                    <Bar dataKey="minutes" name="Time logged" fill="var(--blue)" radius={[0, 4, 4, 0]} barSize={18}>
                      <LabelList dataKey="minutes" position="right" formatter={(value) => formatDuration(value)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </section>
    ),
    activity: (
      <section className="stats-panel" aria-labelledby="stats-activity-heading">
        <header className="stats-panel-head">
          <h2 id="stats-activity-heading">Your activity</h2>
          <TableViewToggle open={showActivityTable} onToggle={() => setShowActivityTable((open) => !open)} />
        </header>
        <p className="stats-takeaway">
          You logged <strong>{lastWeekEntries} {lastWeekEntries === 1 ? "entry" : "entries"}</strong> last week.
          {busiestWeekday && <> You log most on <strong>{busiestWeekday}</strong>.</>}
        </p>
        {showActivityTable ? (
          <table className="stats-table">
            <caption className="sr-only">Entries per week</caption>
            <thead>
              <tr>
                <th scope="col">Week starting</th>
                <th scope="col">Entries</th>
              </tr>
            </thead>
            <tbody>
              {activityRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{weekLabel(row.key, true)}</th>
                  <td>{row.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="stats-chart" role="img" aria-label="Entries per week">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                <Tooltip
                  cursor={false}
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: "var(--muted)" }}
                  formatter={(value) => [value, "Entries"]}
                />
                <Bar dataKey="entries" name="Entries" radius={[4, 4, 0, 0]}>
                  {/* The newest week is drawn in the full accent colour and the
                      rest lighter, so the eye lands on "this week so far"
                      first. The counts are in the takeaway and the table view
                      too, so the shading is never the only way to read it. */}
                  {activityRows.map((row, index) => (
                    <Cell
                      key={row.key}
                      fill={index === activityRows.length - 1 ? "var(--blue)" : "var(--blue-soft)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    ),
    custom: (
      <section className="stats-panel" aria-labelledby="stats-custom-heading">
        <MyStatsPanel projects={recentProjects} />
      </section>
    ),
    fields: (
      <section className="stats-panel" aria-labelledby="stats-fields-heading">
        <header className="stats-panel-head">
          <h2 id="stats-fields-heading">Look inside a project</h2>
        </header>
        {projects.length === 0 ? (
          <p className="stats-hint">Create a project to see what its fields add up to.</p>
        ) : (
          <>
            <label className="field-label stats-project-picker">
              Project
              <select value={fieldsProjectId} onChange={(event) => setFieldsProjectId(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {fieldsProject && (
              <FieldStatisticsPanel projectId={fieldsProject.id} schemaVersion={fieldsProject.schema_version} />
            )}
          </>
        )}
      </section>
    ),
    trend: (
      <section className="stats-panel" aria-labelledby="stats-trend-heading">
        <header className="stats-panel-head">
          <h2 id="stats-trend-heading">A field over time</h2>
        </header>
        <FieldTimeline projects={projects} embedded />
      </section>
    ),
  }

  return (
    <section className="statistics-page" aria-label="Your statistics">
      <header className="stats-header">
        <div>
          <h1>Your statistics</h1>
          <p>How your logbook is going, at a glance.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={openCustomise}>
          Customise
        </button>
      </header>

      {loading ? (
        <div className="stats-loading">
          <div className="stats-cards" aria-hidden="true">
            {["a", "b", "c", "d"].map((key) => (
              <span key={key} className="stat-card stat-card-skeleton" />
            ))}
          </div>
          <SkeletonRows rows={2} height={200} label="Loading your statistics" />
        </div>
      ) : error ? (
        <div className="stats-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : isEmpty ? (
        <GettingStarted projects={projects} onNavigate={onNavigate} />
      ) : (
        layout
          .filter((panel) => panel.visible && panels[panel.id])
          .map((panel) => <Fragment key={panel.id}>{panels[panel.id]}</Fragment>)
      )}

      {customiseOpen && (
        <CustomiseDrawer
          draft={draft}
          saving={saving}
          saveError={saveError}
          onToggle={toggleDraftPanel}
          onMove={moveDraftPanel}
          onReset={() => setDraft(DEFAULT_LAYOUT)}
          onClose={() => setCustomiseOpen(false)}
          onSave={() => persistLayout(draft)}
        />
      )}
    </section>
  )
}

/** One headline number, with a plain-English "?" beside it. */
function StatCard({ label, value, sub, help, helpLabel }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <article className="stat-card">
      <div className="stat-card-head">
        <h3>{label}</h3>
        <button
          type="button"
          className="stat-card-help"
          aria-label={helpLabel}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>
      </div>
      <strong className="stat-card-value">{value}</strong>
      {sub && <span className="stat-card-sub">{sub}</span>}
      {helpOpen && <p className="stat-card-hint">{help}</p>}
    </article>
  )
}

function TableViewToggle({ open, onToggle }) {
  return (
    <button type="button" className="btn-text stats-table-toggle" onClick={onToggle}>
      {open ? "Show as chart" : "Show as table"}
    </button>
  )
}

/** What a brand-new logbook sees instead of empty charts. */
function GettingStarted({ projects, onNavigate }) {
  const steps = [
    { title: "Create a project", done: projects.length > 0 },
    { title: "Log your first entry and add how long it took" },
    { title: "Come back tomorrow to start a streak" },
  ]

  return (
    <div className="stats-empty">
      <h2>Your stats will appear here</h2>
      <ol className="stats-steps">
        {steps.map((step, index) => (
          <li key={step.title} className={step.done ? "is-done" : ""}>
            <span className="stats-step-marker" aria-hidden="true">
              {step.done ? "✓" : index + 1}
            </span>
            <span>
              {step.title}
              {step.done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-primary" onClick={() => onNavigate("home")}>
        Go to Projects
      </button>
    </div>
  )
}

/**
 * The Customise drawer: show, hide and reorder the panels, then save the
 * arrangement to the server. The draft is a copy of the saved layout, so
 * closing without saving changes nothing.
 */
function CustomiseDrawer({ draft, saving, saveError, onToggle, onMove, onReset, onClose, onSave }) {
  const drawerRef = useDialogFocus(true, onClose)

  return (
    <>
      <div className="customise-backdrop" onClick={onClose} role="presentation" />
      <aside
        ref={drawerRef}
        className="customise-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customise-title"
      >
        <header className="customise-head">
          <h2 id="customise-title">Customise your statistics</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close customise">
            ×
          </button>
        </header>

        <ul className="customise-list">
          {draft.map((panel, index) => (
            <li key={panel.id} className={panel.visible ? "" : "is-hidden"}>
              <label className="customise-panel-name">
                <input
                  type="checkbox"
                  checked={panel.visible}
                  onChange={() => onToggle(panel.id)}
                />
                {PANEL_LABELS[panel.id] || panel.id}
              </label>
              <span className="customise-order">
                <button
                  type="button"
                  className="btn-icon"
                  disabled={index === 0}
                  aria-label={`Move ${PANEL_LABELS[panel.id] || panel.id} up`}
                  onClick={() => onMove(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={index === draft.length - 1}
                  aria-label={`Move ${PANEL_LABELS[panel.id] || panel.id} down`}
                  onClick={() => onMove(index, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>

        {saveError && <p className="stats-error" role="alert">{saveError}</p>}

        <footer className="customise-foot">
          <button type="button" className="btn-text" onClick={onReset}>
            Reset to default
          </button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save layout"}
          </button>
        </footer>
      </aside>
    </>
  )
}

/**
 * "My stats" (US-3.8): the figures this person has defined for themselves.
 * The panel fetches its own list, like the other reused panels, so a problem
 * with one stat never takes the rest of the page down with it.
 */
function MyStatsPanel({ projects }) {
  const [statistics, setStatistics] = useState(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    let active = true
    fetchCustomStatistics()
      .then((loaded) => {
        if (active) {
          setStatistics(Array.isArray(loaded) ? loaded : [])
          setError("")
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load your stats.")
        }
      })
    return () => { active = false }
  }, [retry])

  const reload = () => setRetry((value) => value + 1)

  return (
    <>
      <header className="stats-panel-head">
        <h2 id="stats-custom-heading">My stats</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setEditing(null)
            setBuilderOpen(true)
          }}
        >
          Make your own stat
        </button>
      </header>

      {statistics === null ? (
        <div className="saved-stats-loading" aria-hidden="true">
          <span className="stat-card stat-card-skeleton" />
          <span className="stat-card stat-card-skeleton" />
        </div>
      ) : error ? (
        <div className="stats-error" role="alert">
          {error}{" "}
          <button type="button" onClick={reload}>Retry</button>
        </div>
      ) : statistics.length === 0 ? (
        <div className="stats-placeholder">
          <p>No stats of your own yet. Make one from any project's numbers.</p>
        </div>
      ) : (
        <ul className="saved-stats">
          {statistics.map((statistic) => (
            <SavedStatCard
              key={statistic.id}
              statistic={statistic}
              onEdit={() => {
                setEditing(statistic)
                setBuilderOpen(true)
              }}
              onDeleted={reload}
            />
          ))}
        </ul>
      )}

      {builderOpen && (
        <StatBuilderDialog
          projects={projects}
          statistic={editing}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            setBuilderOpen(false)
            reload()
          }}
        />
      )}
    </>
  )
}

/** One saved figure: its name, the number it works out to right now, and
 * the sentence saying what it is. */
function SavedStatCard({ statistic, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const remove = async () => {
    setDeleting(true)
    setError("")
    try {
      await deleteCustomStatistic(statistic.id)
      onDeleted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this stat.")
      setDeleting(false)
    }
  }

  return (
    <li className="saved-stat-card">
      <div className="saved-stat-head">
        <h3>{statistic.name}</h3>
        <span className="saved-stat-actions">
          <EditButton onClick={onEdit} />
          <TrashButton label="Delete" onClick={remove} disabled={deleting} />
        </span>
      </div>
      <strong className="saved-stat-value">
        {statistic.value == null ? "—" : formatStatValue(statistic.value)}
      </strong>
      <span className="saved-stat-desc">
        {`${statistic.description} · ${statistic.project_name}`}
      </span>
      {/* A formula the schema has moved on from still shows, with the reason
          it cannot produce a number, so the person can edit or delete it. */}
      {statistic.note && <span className="saved-stat-note">{statistic.note}</span>}
      {error && <span className="saved-stat-note" role="alert">{error}</span>}
    </li>
  )
}

/** The state the builder opens in: the sentence that wrote a saved formula
 * where there is one, and the formula itself where there is not. */
function initialBuilderState(statistic, projects) {
  const state = {
    aggregate: "Average",
    fieldId: "",
    projectId: projects[0]?.id || "",
    advanced: false,
    formula: "",
  }
  if (!statistic) return state

  state.projectId = statistic.project_id
  const expression = (statistic.expression || "").trim()
  const match = SIMPLE_FORMULA.exec(expression)

  if (match) {
    state.aggregate = Object.keys(AGGREGATE_FUNCTIONS).find(
      (label) => AGGREGATE_FUNCTIONS[label] === match[1],
    )
    // The saved formula names its fields, so match the name back to the field
    // it belongs to — a rename since saving means the sentence can no longer
    // stand for the formula, and the formula is shown as it was instead.
    const project = projects.find((candidate) => candidate.id === statistic.project_id)
    const field = (project?.entry_schema || []).find(
      (candidate) => String(candidate.name).trim().toLowerCase() === match[2].trim().toLowerCase(),
    )
    if (field) {
      state.fieldId = field.id
    } else {
      state.advanced = true
      state.formula = expression
    }
  } else if (expression === "count()") {
    state.aggregate = "Count"
  } else {
    state.advanced = true
    state.formula = expression
  }
  return state
}

/**
 * "Make your own stat": a sentence to fill in — "Show the Average of Hours in
 * Lab practicals" — with the number it works out to shown live. The
 * "advanced" toggle swaps the sentence for a formula written by hand, which
 * is checked by the same grammar the backend checks, and explained in its
 * own words when something in it cannot work.
 */
function StatBuilderDialog({ projects, statistic, onClose, onSaved }) {
  const dialogRef = useDialogFocus(true, onClose)

  const initial = useMemo(
    () => initialBuilderState(statistic, projects),
    [statistic, projects],
  )
  const [aggregate, setAggregate] = useState(initial.aggregate)
  const [fieldId, setFieldId] = useState(initial.fieldId)
  const [projectId, setProjectId] = useState(initial.projectId)
  const [advanced, setAdvanced] = useState(initial.advanced)
  const [formula, setFormula] = useState(initial.formula)
  const [name, setName] = useState(statistic ? statistic.name : "")
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  const project = projects.find((candidate) => candidate.id === projectId) || null
  const numberFields = (project?.entry_schema || []).filter(
    (field) => field.type === "number" || field.type === "computed",
  )
  const selectedField = numberFields.find((field) => field.id === fieldId) || numberFields[0] || null

  const expression = advanced
    ? formula.trim()
    : aggregate === "Count"
      ? "count()"
      : selectedField
        ? `${AGGREGATE_FUNCTIONS[aggregate]}({${selectedField.name}})`
        : ""

  // The preview is the formula worked out against the project's entries, as
  // it will be once saved, so what the person saves is never a surprise.
  useEffect(() => {
    if (!projectId || !expression) {
      setPreview(null)
      setPreviewError("")
      return undefined
    }
    let active = true
    previewCustomStatistic(projectId, expression)
      .then((result) => {
        if (active) {
          setPreview(result)
          setPreviewError("")
        }
      })
      .catch((caught) => {
        if (active) {
          setPreview(null)
          setPreviewError(
            caught instanceof Error ? caught.message : "Could not work this formula out.",
          )
        }
      })
    return () => { active = false }
  }, [projectId, expression])

  const toggleAdvanced = () => {
    if (advanced) {
      setAdvanced(false)
    } else {
      // The formula starts from whatever the sentence had built, so hand-
      // writing is a way of refining a stat, not of starting over.
      if (expression) setFormula(expression)
      setAdvanced(true)
    }
  }

  const save = async () => {
    setSaving(true)
    setSaveError("")
    try {
      if (statistic) {
        await updateCustomStatistic(statistic.id, { name: name.trim(), expression })
      } else {
        await createCustomStatistic({ project_id: projectId, name: name.trim(), expression })
      }
      onSaved()
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this stat.")
      setSaving(false)
    }
  }

  return (
    <>
      <div className="customise-backdrop" onClick={onClose} role="presentation" />
      <div
        ref={dialogRef}
        className="stats-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stat-builder-title"
      >
        <header className="stats-dialog-head">
          <h2 id="stat-builder-title">{statistic ? "Edit your stat" : "Make your own stat"}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {advanced ? (
          <label className="field-label">
            Formula
            <input
              type="text"
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              placeholder="e.g. sum({Hours}) / count()"
              spellCheck={false}
            />
          </label>
        ) : (
          <p className="stat-sentence">
            Show the{" "}
            <select
              aria-label="What to show"
              value={aggregate}
              onChange={(event) => setAggregate(event.target.value)}
            >
              {Object.keys(AGGREGATE_FUNCTIONS).map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>{" "}
            of{" "}
            {aggregate === "Count" ? (
              "entries"
            ) : (
              <select
                aria-label="Field"
                value={selectedField ? selectedField.id : ""}
                onChange={(event) => setFieldId(event.target.value)}
              >
                {numberFields.map((field) => (
                  <option key={field.id} value={field.id}>{field.name}</option>
                ))}
              </select>
            )}{" "}
            in{" "}
            <select
              aria-label="Project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}{candidate.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </p>
        )}
        {!advanced && aggregate !== "Count" && numberFields.length === 0 && (
          <p className="stats-hint">This project has no number fields yet, so there is nothing to add up.</p>
        )}

        <button type="button" className="btn-text stats-advanced-toggle" onClick={toggleAdvanced}>
          {advanced ? "Use the simple builder" : "Advanced: write a formula"}
        </button>

        <div className="stat-preview" aria-live="polite">
          {previewError ? (
            <p className="stat-formula-error" role="alert">{previewError}</p>
          ) : preview ? (
            <p>
              <strong>{preview.value == null ? "—" : formatStatValue(preview.value)}</strong>
              <span className="stat-preview-note">
                {preview.note
                  ? preview.note
                  : `across ${preview.entries_used} ${preview.entries_used === 1 ? "entry" : "entries"}`}
              </span>
            </p>
          ) : expression ? (
            <p className="stats-hint">Working it out…</p>
          ) : null}
        </div>

        <label className="field-label">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Average hours"
            maxLength={100}
          />
        </label>

        {saveError && <p className="stats-error" role="alert">{saveError}</p>}

        <footer className="stats-dialog-foot">
          <button type="button" className="btn-text" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={saving || !name.trim() || !expression}
          >
            {saving ? "Saving…" : statistic ? "Save changes" : "Save stat"}
          </button>
        </footer>
      </div>
    </>
  )
}
