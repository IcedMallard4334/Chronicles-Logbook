import { useLayoutEffect, useRef } from "react"

import LogoIcon from "./ChroniclesLogo"
import { PencilIcon } from "./EditIcon"
import EntryTaskGuide from "./EntryTaskGuide"
import { EntryBasics, EntryFieldInput, InfoTip } from "./EntryShared"
import FormField from "./FormField"
import { ActivityIcon, BoardIcon, OutstandingIcon, TodayIcon } from "./NavIcons"
import { StreakIcon } from "./Streaks"
import { TrashButton } from "./TrashIcon"
import "./Drawer.css"

/**
 * The parts every walkthrough scene is built from: the app's top bar, sidebar, project page and forms, drawn
 * with the app's own components and class names. A scene picks what it needs and says what is on show; the
 * kit has no behaviour of its own.
 */

export const noop = () => {}
const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true }

/** The same example project the walkthroughs share, so one lesson's picture matches the next. */
export const WEIGHT = { id: "f-weight", name: "Weight (kg)", type: "number" }
export const EXERCISE = { id: "f-exercise", name: "Exercise", type: "dropdown", options: ["Squat", "Bench press", "Deadlift"] }

export function TopBar({ active = "Home" }) {
  const item = (label, icon) => (
    <button type="button" className={`nav-item${label === active ? " active" : ""}`} tabIndex={-1} data-nav={label}>
      {icon}
      <span>{label}</span>
    </button>
  )
  return (
    <header className="topbar">
      <nav className="nav-pill" aria-label="Main navigation">
        <div className="nav-pill-left">
          <LogoIcon size={30} />
          <span className="brand-name">Chronicles</span>
        </div>
        <div className="nav-pill-center">
          {item("Home", <svg {...svg}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>)}
          {item("Mira", <svg {...svg}><path d="M12 3a7 7 0 0 0-7 7v3a4 4 0 0 0 4 4h1l2 3 2-3h1a4 4 0 0 0 4-4v-3a7 7 0 0 0-7-7Z" /><path d="M9 11h.01M15 11h.01" /></svg>)}
          {item("All Entries", <svg {...svg}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>)}
          {item("All Tasks", <svg {...svg}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>)}
          {item("Board", <BoardIcon />)}
          {item("Calendar", <svg {...svg}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>)}
          {item("Statistics", <svg {...svg}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>)}
        </div>
        <div className="nav-pill-right">
          <ul className="streaks" aria-label="Daily streaks">
            <li className="streak is-alive is-done"><StreakIcon kind="login" /><span className="streak-count">1</span></li>
            <li className="streak is-alive is-done"><StreakIcon kind="interaction" /><span className="streak-count">1</span></li>
          </ul>
          <div className="account-actions"><div className="user-menu"><span className="user-menu-trigger user-avatar">D</span></div></div>
        </div>
      </nav>
    </header>
  )
}

/** The Home panel. `activeView` is "Dashboard" or "Activity" when no project is open; `projects` are shown as in the app. */
export function Sidebar({ activeView = null, projects = [], selected = null, entries = 0, hours = "0m" }) {
  const view = (label, icon) => (
    <button type="button" className={activeView === label ? "is-active" : ""} tabIndex={-1} data-nav={label}>{icon} {label}</button>
  )
  return (
    <div className="sidebar-stack">
      <aside className="sidebar workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar-brand">
          <span className="workspace-sidebar-mark" aria-hidden="true">C</span>
          <div><strong>Workspace</strong><span>Projects and activity</span></div>
        </div>
        <nav className="workspace-sidebar-nav" aria-label="Workspace views">
          {view("Dashboard", <svg {...svg}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>)}
          {view("Activity", <ActivityIcon />)}
          {view("Today", <TodayIcon />)}
          {view("Outstanding", <OutstandingIcon />)}
        </nav>
        <div className="workspace-sidebar-stats" aria-label="Workspace summary">
          <span><strong>{projects.length}</strong> Active Projects</span>
          <span><strong>{entries}</strong> Logged Entries</span>
          <span><strong>{hours}</strong> Hours Logged</span>
          <span><strong>0</strong> Open Tasks</span>
        </div>
        <div className="sidebar-head">
          <h2>Projects</h2>
          <span className="btn-icon" aria-hidden="true">+</span>
        </div>
        <label className="workspace-sidebar-search"><input type="search" placeholder="Search projects…" tabIndex={-1} readOnly /></label>
        {projects.length ? (
          <ul className="project-list" role="listbox" aria-label="Projects">
            {projects.map((name) => (
              <li key={name}>
                <button type="button" className={`project-button${name === selected ? " active" : ""}`} tabIndex={-1}>
                  <span className="project-name">{name}</span>
                  <small className="project-status">On track</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">No projects yet.</p>
        )}
      </aside>
    </div>
  )
}

/** The page of a project: its title, field count and tabs. `children` is the body of the open tab. */
export function ProjectPage({ name = "Gym log", fields = 3, tab = "Entries", children }) {
  const tabButton = (label) => (
    <button type="button" role="tab" aria-selected={tab === label} className={tab === label ? "active" : ""} tabIndex={-1} data-target={`tab-${label.toLowerCase()}`}>{label}</button>
  )
  return (
    <section className="project-detail">
      <header className="detail-header">
        <div className="detail-title-block">
          <div className="project-title-row">
            <h2>{name}</h2>
            <span className="btn-icon btn-edit"><PencilIcon size={16} /></span>
          </div>
          <div className="detail-description-wrap"><p className="detail-description">Sessions, weights and how I felt.</p></div>
          <p className="detail-meta"><span className="meta-pill">{fields} fields · Schema</span></p>
          <div className="detail-actions" role="group" aria-label="Project actions">
            <span className="btn-secondary detail-share-btn">Share this project</span>
            <span className="btn-secondary detail-archive-btn">Archive project</span>
            <TrashButton label="Delete project" text="Delete project" tabIndex={-1} />
          </div>
        </div>
        <div className="tab-switch" role="tablist" aria-label="Project tabs">
          {tabButton("Entries")}
          {tabButton("Schema")}
          {tabButton("Tasks")}
          {tabButton("Automation")}
        </div>
      </header>
      <div className="detail-body">{children}</div>
    </section>
  )
}

/** The bar above the entries: "Past entries", the Entry or task? guide, and the Log entry button. */
export function EntriesToolbar({ enabled = true, open = false }) {
  return (
    <div className="entries-toolbar">
      <h3>Past entries</h3>
      <EntryTaskGuide />
      <button type="button" className="btn-primary entry-add-toggle" disabled={!enabled} tabIndex={-1} data-target="log-entry">
        <span aria-hidden="true">{open ? "× Close" : "+ Log entry"}</span>
      </button>
    </div>
  )
}

/** One row of "Recent entries", as the entry list draws it. */
export function EntryRow({ title, fields, time, isNew = false, target }) {
  return (
    <li className={`log-row${isNew ? " is-new" : ""}`} data-target={target}>
      <p className="log-title">{title}</p>
      <div className="log-fields">
        {fields.map(([label, value]) => (
          <div className="log-field is-numeric" key={label}>
            <span className="log-label">{label}</span>
            <span className="log-value">{value}</span>
          </div>
        ))}
      </div>
      <span className="log-time">{time} · drawer</span>
    </li>
  )
}

export function EntryList({ children }) {
  return (
    <div className="entry-list">
      <h3>Recent entries</h3>
      <ul className="log-list" role="list">{children}</ul>
    </div>
  )
}

/** The new-entry form, as the entry form draws it, filled in with what the script has typed. */
export function NewEntryForm({ v, extraFields = [WEIGHT] }) {
  const todo = Boolean(v.todo)
  return (
    <div id="new-entry-form">
      <form className="entry-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <div className="panel-head">
          <h3>New entry</h3>
          <p>The fields marked * are needed to save it.</p>
        </div>
        <div className="form-fields">
          <EntryBasics
            title={v.entryTitle || ""}
            onTitle={noop}
            hours={v.entryHours || ""}
            onHours={noop}
            minutes={v.entryMinutes || ""}
            onMinutes={noop}
          />
          {extraFields.map((field) => (
            <EntryFieldInput
              key={field.id}
              field={field}
              optional={todo}
              value={field.id === "f-weight" ? v.entryWeight || "" : v.entryExercise || ""}
              onChange={noop}
              projects={[]}
              entries={[]}
              suggestions={[]}
            />
          ))}
        </div>
        <section className="form-section entry-outstanding" aria-label="Progress">
          <h3 className="form-section-title">Progress</h3>
          <div className="checkbox-with-tip">
            <label className="field-label checkbox-label" data-target="todo-box">
              <input type="checkbox" checked={todo} readOnly tabIndex={-1} />
              This is still to do
            </label>
            <InfoTip text="Marks this as work you haven't finished yet." />
          </div>
          {todo && (
            <FormField label="Due date" typeLabel="Date" size="narrow">
              {(controlProps) => <input {...controlProps} type="date" value={v.due || ""} readOnly />}
            </FormField>
          )}
        </section>
        <div className="actions">
          <button type="submit" className="btn-primary" data-target="save" tabIndex={-1}>Save entry</button>
        </div>
      </form>
    </div>
  )
}

/**
 * The app on screen: top bar, the Home panel and the page beside it, with the page making room for a panel
 * that is open and the cursor on top. Every scene is drawn inside one of these.
 */
export function AppShell({ topActive, panel, wide = false, drawer = false, overlay = null, cursor, children }) {
  const root = useRef(null)

  // With a panel open the page makes room beside it and the top bar shrinks, as it does in the app.
  useLayoutEffect(() => {
    const html = root.current?.ownerDocument.documentElement
    if (!html) return
    html.classList.toggle("has-drawer", drawer)
    html.classList.toggle("drawer-compact", drawer)
    html.style.setProperty("--drawer-inset", drawer ? "520px" : "0px")
  }, [drawer])

  return (
    <div ref={root} className="app-shell wt-scene">
      <TopBar active={topActive} />
      <main className={`app-main ${wide ? "app-main-wide" : "home-main"}`}>
        {panel}
        <div className="content">{children}</div>
      </main>
      {overlay}
      <span className={`wt-cursor${cursor.clicking ? " is-clicking" : ""}`} style={{ left: cursor.x, top: cursor.y }} />
    </div>
  )
}
