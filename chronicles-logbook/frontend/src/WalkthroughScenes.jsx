import LogoIcon from "./ChroniclesLogo"
import { EntryBasics, EntryFieldInput } from "./EntryShared"
import FormField, { ShortTextBox } from "./FormField"
import { BuiltInFieldCards, SchemaFieldEditor, SchemaFieldSummary } from "./SchemaParts"
import { TrashButton } from "./TrashIcon"
import {
  AppShell, EXERCISE, EntriesToolbar, EntryList, EntryRow, NewEntryForm, ProjectPage, Sidebar, WEIGHT, noop,
} from "./SceneKit"
import "./ActivityHub.css"
import "./BoardView.css"
import "./CalendarView.css"
import "./EntryTimeline.css"
import "./WorkspacePages.css"

/**
 * What each walkthrough shows: the real app, drawn from the real components and classes at one moment of
 * the script. A scene has no behaviour of its own; it is given the values the script has set by now and
 * draws them. Elements the cursor can go to carry `data-target`.
 */

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true }
const when = (day) => new Date(2026, 9, day, 10, 30).toLocaleString()
const GYM = ["Gym log"]

// ── 1. Making your first logbook ─────────────────────────────────────

function EmptyWelcome() {
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <div className="empty-logo-hero">
          <LogoIcon size={72} />
          <h2>Welcome to Chronicles</h2>
          <p>Your digital logbook for tracking projects, entries, and progress.</p>
          <div className="empty-actions">
            <button type="button" className="btn-primary btn-lg" data-target="create-first" tabIndex={-1}>Create your first project</button>
            <button type="button" className="btn-secondary btn-lg" tabIndex={-1}>Load demo data</button>
          </div>
          <button type="button" className="btn-text empty-learning-link" tabIndex={-1}>New to digital logbooks? Explore Learning Chronicles →</button>
        </div>
        <div className="empty-features">
          <div className="empty-feature">
            <div className="empty-feature-icon"><svg {...svg}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg></div>
            <h3>Custom schemas</h3><span>Define your own fields per project</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon"><svg {...svg}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg></div>
            <h3>Quick capture</h3><span>Log entries in seconds</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon"><svg {...svg}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg></div>
            <h3>Tasks & deadlines</h3><span>Stay on top of what's due</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewProjectDrawer({ v }) {
  const starters = [
    { id: "f-desc", name: "Description", type: "long_text", required: false },
    { id: "f-date", name: "Date", type: "date", required: false },
  ]
  const extra = v.extraField && { id: "f-extra", name: v.extraName || "", type: v.extraType === "Number" ? "number" : "text", required: true }
  const schema = extra ? [...starters, extra] : starters
  return (
    <aside className="drawer project-drawer" style={{ "--drawer-width": "520px" }}>
      <div className="drawer-resize" aria-hidden="true" />
      <header className="drawer-head">
        <div className="drawer-heading">
          <h2>Start a new project</h2>
          <p className="drawer-subtitle">Name your logbook, then look over the form its entries will use.</p>
        </div>
        <span className="drawer-close" aria-hidden="true">×</span>
      </header>
      <div className="drawer-progress" aria-hidden="true" />
      <div className="drawer-body">
        <form onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="form-fields">
            <FormField label="Project name" typeLabel="Short text" required size="short" count={{ length: (v.name || "").length, max: 255 }}>
              {(controlProps) => <div data-target="name"><ShortTextBox {...controlProps} value={v.name || ""} onValueChange={noop} placeholder="e.g. Field Notes" /></div>}
            </FormField>
            <FormField label="Description (optional)" typeLabel="Long text" size="long" count={{ length: (v.description || "").length, max: 4000 }}>
              {(controlProps) => <textarea {...controlProps} data-target="description" rows={4} value={v.description || ""} onChange={noop} placeholder="What is this project for?" />}
            </FormField>
          </div>
          <section className="form-section">
            <h3 className="form-section-title" data-target="entry-form-heading">Entry form</h3>
            <p className="form-section-note">
              Every entry asks for a title and the time it took. A description and a date are added
              to start you off; change them, add more, or take them out.
            </p>
            <div className={`wt-group${v.highlight === "builtin" ? " is-lit" : ""}`} data-target="builtin">
              <BuiltInFieldCards editing />
            </div>
            <div className={`field-list wt-group${v.highlight === "starter" ? " is-lit" : ""}`} data-target="starter">
              {starters.map((field, index) => (
                <SchemaFieldEditor key={field.id} field={field} index={index} schema={schema} latestData={null} linkable={[]} onChange={noop} onRemove={noop} />
              ))}
            </div>
            {extra && (
              <div className="field-list wt-new-field">
                <SchemaFieldEditor field={extra} index={2} schema={schema} latestData={null} linkable={[]} onChange={noop} onRemove={noop} />
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn-secondary" data-target="add-field" tabIndex={-1}>Add field</button>
            </div>
          </section>
          <div className="modal-actions drawer-actions">
            <button type="button" className="btn-secondary" tabIndex={-1}>Cancel</button>
            <button type="submit" className="btn-primary" data-target="create" tabIndex={-1}>Create project</button>
          </div>
        </form>
      </div>
    </aside>
  )
}

function FirstLogbookScene({ values: v, cursor }) {
  const project = v.screen === "project"
  const saved = Boolean(v.saved)
  return (
    <AppShell
      topActive="Home"
      drawer={Boolean(v.drawer)}
      overlay={v.drawer && <NewProjectDrawer v={v} />}
      cursor={cursor}
      panel={<Sidebar activeView={project ? null : "Dashboard"} projects={project ? GYM : []} selected="Gym log" entries={saved ? 1 : 0} hours={saved ? "1h" : "0m"} />}
    >
      {project ? (
        <ProjectPage fields={3}>
          <EntriesToolbar enabled={saved} />
          {saved && <p className="rule-applied-notice" role="status">Entry saved.</p>}
          {!saved && <NewEntryForm v={v} />}
          {saved ? (
            <EntryList><EntryRow title="Leg day" fields={[["Weight (kg)", "80"]]} time={when(8)} target="entry-row" /></EntryList>
          ) : (
            <p className="hint">No entries yet.</p>
          )}
        </ProjectPage>
      ) : (
        <EmptyWelcome />
      )}
    </AppShell>
  )
}

// ── 2. Designing your logbook's fields ───────────────────────────────

const SCHEMA = [
  { id: "f-desc", name: "Description", type: "long_text", required: false },
  { id: "f-date", name: "Date", type: "date", required: false },
  WEIGHT,
]

function SchemaTab({ v }) {
  const editing = Boolean(v.editing)
  const added = Boolean(v.exerciseAdded)
  const exercise = added && {
    ...EXERCISE,
    name: v.exerciseName ?? "",
    type: v.exerciseType === "Choice" ? "dropdown" : "text",
    options: (v.exerciseOptions || "").split(",").map((option) => option.trim()).filter(Boolean),
  }
  const weight = { ...WEIGHT, required: v.weightRequired !== false }
  const fields = [SCHEMA[0], SCHEMA[1], weight, ...(exercise ? [exercise] : [])]
  return (
    <div className="schema-builder">
      <div className="panel-head">
        <h3>Entry schema</h3>
        <p>{editing ? "Existing entries are brought along with any change you make." : "The fields this logbook asks for."}</p>
      </div>
      <BuiltInFieldCards editing={editing} />
      <div className="field-list">
        {fields.map((field, index) => editing
          ? (
            <div key={field.id} className={field.id === "f-exercise" ? "wt-new-field" : field.id === "f-weight" ? "wt-weight-field" : undefined}>
              <SchemaFieldEditor field={field} index={index} schema={fields} latestData={null} linkable={[]} onChange={noop} onRemove={noop} />
            </div>
          )
          : <SchemaFieldSummary key={field.id} field={field} schema={fields} projects={[]} />)}
      </div>
      {v.schemaSaved && (
        <div className="success" role="status">
          <p>Schema saved.</p>
          <button type="button" className="btn-text" tabIndex={-1}>Go to Entries to start logging</button>
        </div>
      )}
      <div className="actions">
        {editing ? (
          <>
            <button type="button" className="btn-secondary" data-target="add-field" tabIndex={-1}>Add field</button>
            <button type="button" className="btn-text" tabIndex={-1}>Cancel</button>
            <button type="button" className="btn-primary" data-target="save-schema" tabIndex={-1}>Save schema</button>
          </>
        ) : (
          <button type="button" className="btn-primary" data-target="edit-schema" tabIndex={-1}>Edit schema</button>
        )}
      </div>
    </div>
  )
}

function DesignFieldsScene({ values: v, cursor }) {
  const onSchema = v.tab === "Schema"
  return (
    <AppShell topActive="Home" cursor={cursor} panel={<Sidebar projects={GYM} selected="Gym log" entries={2} hours="1h 45m" />}>
      <ProjectPage fields={v.exerciseAdded && v.schemaSaved ? 4 : 3} tab={onSchema ? "Schema" : "Entries"}>
        {onSchema ? (
          <SchemaTab v={v} />
        ) : (
          <>
            <EntriesToolbar />
            <EntryList>
              <EntryRow title="Bench press" fields={[["Weight (kg)", "45"]]} time={when(6)} />
              <EntryRow title="Squat day" fields={[["Weight (kg)", "60"]]} time={when(4)} />
            </EntryList>
          </>
        )}
      </ProjectPage>
    </AppShell>
  )
}

// ── 3. Adding an entry ───────────────────────────────────────────────

function AddEntryScene({ values: v, cursor }) {
  const saved = Boolean(v.saved)
  const open = Boolean(v.formOpen) && !saved
  return (
    <AppShell
      topActive="Home"
      cursor={cursor}
      panel={<Sidebar projects={GYM} selected="Gym log" entries={saved ? 3 : 2} hours={saved ? "3h 5m" : "1h 45m"} />}
    >
      <ProjectPage fields={3}>
        <EntriesToolbar open={open} />
        {saved && <p className="rule-applied-notice" role="status">Entry saved.</p>}
        {open && <NewEntryForm v={v} />}
        <EntryList>
          {saved && <EntryRow title="Back and biceps" fields={[["Weight (kg)", "62"]]} time={when(8)} isNew target="entry-row" />}
          <EntryRow title="Bench press" fields={[["Weight (kg)", "45"]]} time={when(6)} />
          <EntryRow title="Squat day" fields={[["Weight (kg)", "60"]]} time={when(4)} />
        </EntryList>
      </ProjectPage>
    </AppShell>
  )
}

// ── 4. Opening and editing an entry ──────────────────────────────────

function EntryDrawer({ v }) {
  const editing = Boolean(v.editing)
  const weight = v.weight ?? "60"
  const title = v.title ?? "Squat day"
  return (
    <aside className="drawer entry-drawer" style={{ "--drawer-width": "520px" }}>
      <div className="drawer-resize" aria-hidden="true" />
      <header className="drawer-head">
        <div className="drawer-heading">
          <h2>{v.titleSaved ?? "Squat day"}</h2>
          <p className="drawer-subtitle">Gym log · logged by drawer · {when(4)}</p>
        </div>
        <span className="drawer-close" aria-hidden="true" data-target="drawer-close">×</span>
      </header>
      <div className="drawer-progress" aria-hidden="true" />
      <div className="drawer-body">
        {!editing ? (
          <>
            <dl className="entry-detail-fields">
              <div className="entry-detail-field"><dt>Weight (kg)</dt><dd>{v.weightSaved ?? "60"}</dd></div>
              <div className="entry-detail-field"><dt>Time spent</dt><dd>60 min</dd></div>
              <div className="entry-detail-field"><dt>Status</dt><dd>Done</dd></div>
            </dl>
            <section className="entry-history">
              <div className="entry-history-heading">
                <h3>History</h3>
                <button type="button" className="btn-text" data-target="view-history" tabIndex={-1}>{v.history ? "Refresh" : "View history"}</button>
              </div>
              {v.history && (
                <ol className="entry-history-list">
                  <li className="entry-history-revision">
                    <div className="entry-history-summary"><strong>v2</strong> · Edited (current) · {when(8)}</div>
                    <p className="hint">Corrected the weight</p>
                  </li>
                  <li className="entry-history-revision">
                    <div className="entry-history-summary"><strong>v1</strong> · Created · {when(4)}</div>
                    <button type="button" className="btn-text" tabIndex={-1}>View this version</button>
                  </li>
                </ol>
              )}
            </section>
            <div className="actions drawer-actions">
              <TrashButton label="Delete" text="Delete" tabIndex={-1} />
              <button type="button" className="btn-primary" data-target="edit-entry" tabIndex={-1}>Edit</button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => event.preventDefault()} noValidate>
            <div className="form-fields">
              <EntryBasics title={title} onTitle={noop} hours="1" onHours={noop} minutes="" onMinutes={noop} />
              <EntryFieldInput field={WEIGHT} value={weight} onChange={noop} projects={[]} entries={[]} suggestions={[]} />
            </div>
            <FormField label="Reason for change (optional)" typeLabel="Short text" size="short" count={{ length: (v.reason || "").length, max: 500 }}>
              {(controlProps) => <div data-target="reason"><ShortTextBox {...controlProps} value={v.reason || ""} onValueChange={noop} placeholder="e.g. Corrected the hours" /></div>}
            </FormField>
            <div className="actions drawer-actions">
              <button type="button" className="btn-text" tabIndex={-1}>Cancel</button>
              <button type="submit" className="btn-primary" data-target="save-changes" tabIndex={-1}>Save changes</button>
            </div>
          </form>
        )}
      </div>
    </aside>
  )
}

function EditEntryScene({ values: v, cursor }) {
  const open = Boolean(v.open)
  const shownWeight = v.weightSaved ?? "60"
  return (
    <AppShell
      topActive="Home"
      drawer={open}
      overlay={open && <EntryDrawer v={v} />}
      cursor={cursor}
      panel={<Sidebar projects={GYM} selected="Gym log" entries={2} hours="1h 45m" />}
    >
      <ProjectPage fields={3}>
        <EntriesToolbar />
        <EntryList>
          <EntryRow title="Bench press" fields={[["Weight (kg)", "45"]]} time={when(6)} />
          <EntryRow title={v.titleSaved ?? "Squat day"} fields={[["Weight (kg)", shownWeight]]} time={when(4)} target="entry-row" />
        </EntryList>
      </ProjectPage>
    </AppShell>
  )
}

// ── 5. Building a history ────────────────────────────────────────────

const HISTORY = [
  { day: 10, title: "Follow-up inspection", fields: [["Condition", "Good"]] },
  { day: 3, title: "Maintenance performed", fields: [["Equipment", "Pump A"], ["Action", "Replaced the worn seal"]] },
  { day: 1, title: "Equipment inspected", fields: [["Equipment", "Pump A"], ["Condition", "One seal worn"]] },
]

/** The Activity page's timeline, with the entries given and the search typed so far. */
function TimelinePage({ entries, project, query = "" }) {
  const text = query.toLowerCase()
  const shown = entries.filter((entry) => !text || [entry.title, ...entry.fields.flat()].join(" ").toLowerCase().includes(text))
  return (
    <div className="activity-hub">
      <div className="activity-hub-tabs" role="tablist" aria-label="Activity views">
        <button type="button" role="tab" aria-selected="true" className="is-selected" tabIndex={-1}>Logged</button>
        <button type="button" role="tab" aria-selected="false" tabIndex={-1}>Scheduled</button>
      </div>
      <section className="timeline" aria-label="Entry timeline">
        <header className="timeline-header timeline-title-row">
          <div>
            <h2>Activity</h2>
            <p>Browse your entries across all projects in chronological order.</p>
          </div>
          <button type="button" className="btn-secondary" tabIndex={-1}>Field trends</button>
        </header>
        <div className="entry-timeline-filters is-open" aria-label="Timeline filters">
          <label>Search<input type="search" placeholder="Search entries…" value={query} readOnly tabIndex={-1} data-target="search" /></label>
          <label>Project<select tabIndex={-1} data-target="project-filter"><option>All projects</option></select></label>
          <label>Tag<input type="search" placeholder="Any tag" readOnly tabIndex={-1} /></label>
          <label>Status<select tabIndex={-1}><option>Everything</option></select></label>
          <label>Start date<input type="date" readOnly tabIndex={-1} /></label>
          <label>End date<input type="date" readOnly tabIndex={-1} /></label>
          <label>Order<select tabIndex={-1}><option>Newest first</option></select></label>
        </div>
        <div className="timeline-content">
          {shown.length === 0 ? (
            <div className="workspace-empty">
              <span className="workspace-empty-icon" aria-hidden="true">◷</span>
              <h3>No entries match these filters</h3>
              <p>Try widening the date range or clearing a filter.</p>
            </div>
          ) : (
            <ol className="timeline-list">
              {shown.map((entry, index) => (
                <li key={entry.title} className="timeline-row" data-target={index === 0 ? "first-row" : undefined}>
                  <div className="timeline-marker" aria-hidden="true" />
                  <article>
                    <div className="timeline-meta">
                      <span className="timeline-project">{project}</span>
                      <time className="timeline-time">{new Date(2026, 9, entry.day, 9, 0).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
                    </div>
                    <h3 className="timeline-entry-title">{entry.title}</h3>
                    <dl className="timeline-fields">
                      {entry.fields.map(([label, value]) => (
                        <div key={label} className="timeline-field"><dt className="timeline-label">{label}</dt><dd className="timeline-value">{value}</dd></div>
                      ))}
                    </dl>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

function HistoryScene({ values: v, cursor }) {
  const count = v.count ?? 1
  // Entries arrive oldest first, so the newest of those shown is at the top.
  const arrived = HISTORY.slice(HISTORY.length - count)
  return (
    <AppShell topActive="Home" cursor={cursor} panel={<Sidebar activeView="Activity" projects={["Maintenance log"]} selected={null} entries={count} hours="0m" />}>
      <TimelinePage entries={arrived} project="Maintenance log" query={v.query || ""} />
    </AppShell>
  )
}

// ── 6. The ways of looking at entries ────────────────────────────────

const GYM_ENTRIES = [
  { day: 8, title: "Deadlift day", fields: [["Weight (kg)", "80"]], done: false },
  { day: 6, title: "Bench press", fields: [["Weight (kg)", "45"]], done: true },
  { day: 4, title: "Squat day", fields: [["Weight (kg)", "60"]], done: true },
]

function BoardPage() {
  const column = (label, entries) => (
    <section className="board-column" aria-label={`${label} (${entries.length})`}>
      <header className="board-column-head"><h2>{label}</h2><span>{entries.length}</span></header>
      <ul className="board-cards">
        {entries.map((entry) => (
          <li key={entry.title} className="board-card">
            <p className="board-card-title">{entry.title}</p>
            <p className="board-card-preview">{entry.fields.map(([name, value]) => `${name}: ${value}`).join(" · ")}</p>
            <footer className="board-card-meta">
              <time>{new Date(2026, 9, entry.day).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</time>
              <label className="board-card-move">Move to<select tabIndex={-1} defaultValue={label}><option>{label}</option></select></label>
            </footer>
          </li>
        ))}
      </ul>
    </section>
  )
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
        <label>Project<select tabIndex={-1}><option>Gym log</option></select></label>
        <label>Group by<select tabIndex={-1}><option>Status</option></select></label>
      </div>
      <p className="board-status-hint">
        Each column is one of this project's statuses. To add or rename one, open the project and use the pencil beside its name (Edit project, then Statuses).
      </p>
      <div className="workspace-body board">
        <div className="board-columns" data-target="board-columns">
          {column("Still to do", GYM_ENTRIES.filter((entry) => !entry.done))}
          {column("Done", GYM_ENTRIES.filter((entry) => entry.done))}
        </div>
      </div>
    </section>
  )
}

function CalendarPage() {
  const first = new Date(2026, 9, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
  const logged = new Set(GYM_ENTRIES.map((entry) => entry.day))
  const today = 8
  return (
    <section className="integrated-calendar" aria-label="Integrated calendar">
      <div className="ic-toolbar">
        <h2>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="ic-navigation">
          <button type="button" tabIndex={-1}>Today</button>
          <button type="button" tabIndex={-1} aria-label="Previous month">‹</button>
          <button type="button" tabIndex={-1} aria-label="Next month">›</button>
        </div>
        <span className="ic-label">Month</span>
        <span className="ic-source">Google + Chronicles</span>
      </div>
      <div className="ic-footer">
        <div className="ic-legend"><span><i className="ic-google-dot" />Google events</span><span><i className="ic-entry-dot" />Logbook entries</span><span><i className="ic-activity-dot" />Activities</span></div>
      </div>
      <div className="ic-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="ic-grid" aria-label="Month dates">
        {days.map((day) => {
          const outside = day.getMonth() !== 9
          const has = !outside && logged.has(day.getDate())
          return (
            <button type="button" tabIndex={-1} key={day.toISOString()} className={`ic-day${outside ? " ic-outside" : ""}${has ? " has-entry" : ""}`}>
              <span className={`ic-number${!outside && day.getDate() === today ? " ic-today" : ""}`}>{day.getDate()}</span>
              <span className="ic-events">{has && <span className="ic-event ic-entry">Log: Gym log</span>}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ViewsScene({ values: v, cursor }) {
  const view = v.view || "entries"
  const wide = view === "board" || view === "calendar"
  const panel = wide ? null : <Sidebar activeView={view === "timeline" ? "Activity" : null} projects={GYM} selected={view === "entries" ? "Gym log" : null} entries={3} hours="2h 30m" />
  return (
    <AppShell topActive={view === "board" ? "Board" : view === "calendar" ? "Calendar" : "Home"} wide={wide} panel={panel} cursor={cursor}>
      {view === "entries" && (
        <ProjectPage fields={3}>
          <EntriesToolbar />
          <EntryList>
            {GYM_ENTRIES.map((entry) => <EntryRow key={entry.title} title={entry.title} fields={entry.fields} time={when(entry.day)} />)}
          </EntryList>
        </ProjectPage>
      )}
      {view === "timeline" && <TimelinePage entries={GYM_ENTRIES} project="Gym log" />}
      {view === "board" && <BoardPage />}
      {view === "calendar" && <CalendarPage />}
    </AppShell>
  )
}

export const SCENES = {
  "first-logbook": FirstLogbookScene,
  "design-fields": DesignFieldsScene,
  "add-entry": AddEntryScene,
  "edit-entry": EditEntryScene,
  "build-history": HistoryScene,
  "views": ViewsScene,
}
