import { useEffect, useMemo, useState } from "react"
import { fetchEntriesGlobal, fetchTasks } from "./api"
import "./HomeWorkspace.css"

const todayKey = () => new Date().toLocaleDateString("en-CA")
const shortDate = value => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" })

export default function HomeWorkspace({ projects, onCreateProject, onToday, onNavigate, onOpenProject }) {
  const [entries, setEntries] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const today = useMemo(todayKey, [])
  const activeProjects = projects.filter(project => !project.archived)
  const archivedCount = projects.length - activeProjects.length

  useEffect(() => {
    let current = true
    Promise.allSettled([
      fetchEntriesGlobal({ page: 1, pageSize: 5 }),
      ...activeProjects.map(project => fetchTasks(project.id, false)),
    ]).then(results => {
      if (!current) return
      setEntries(results[0]?.status === "fulfilled" ? results[0].value : [])
      setTasks(results.slice(1).flatMap((result, index) => result.status === "fulfilled" ? result.value.map(task => ({ ...task, projectName: activeProjects[index].name })) : []))
      setLoading(false)
    })
    return () => { current = false }
  }, [projects])

  const overdue = tasks.filter(task => task.due_date && task.due_date < today)
  const upcoming = tasks.filter(task => task.due_date && task.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4)
  const recentProject = entries.find(entry => entry.project_id) || activeProjects[0]

  return <section className="home-hub" aria-labelledby="home-hub-title">
    <header className="home-hub-header home-hub-welcome">
      <div className="home-hub-welcome-mark" aria-hidden="true">C</div>
      <div className="home-hub-welcome-copy"><p className="home-hub-eyebrow">CHRONICLES WORKSPACE</p><h1 id="home-hub-title">Welcome back</h1><p>Choose a project in the sidebar, or use this overview to decide what comes next.</p></div>
      <div className="home-hub-welcome-actions"><div className="home-hub-summary"><span><strong>{activeProjects.length}</strong> active projects</span><span><strong>{archivedCount}</strong> archived</span></div><button type="button" className="btn-primary" onClick={onCreateProject}>+ New project</button></div>
    </header>

    <section className="home-hub-focus" aria-labelledby="home-focus-title">
      <div><p className="home-hub-eyebrow">TODAY’S OVERVIEW</p><h2 id="home-focus-title">Make today count</h2><p>{loading ? "Checking your workspace…" : overdue.length ? `${overdue.length} task${overdue.length === 1 ? " needs" : "s need"} attention before you move on.` : "Your workspace is clear. Keep the momentum going."}</p></div>
      <div className="home-hub-focus-actions"><div className="home-hub-focus-stat"><strong>{loading ? "–" : overdue.length}</strong><span>needs attention</span></div><button type="button" className="btn-primary" onClick={onToday}>Open Today <span aria-hidden="true">→</span></button></div>
    </section>

    <section className="home-continue" aria-labelledby="home-continue-title">
      <div><p className="home-hub-eyebrow">CONTINUE WORKING</p><h2 id="home-continue-title">{recentProject?.project_name || recentProject?.name || "Pick up where you left off"}</h2><p>{recentProject ? "Open the project and keep your work moving." : "Create a project to begin capturing your work."}</p></div>
      <button type="button" className="btn-secondary" onClick={() => recentProject ? onOpenProject(recentProject.project_id || recentProject.id) : onCreateProject()}>{recentProject ? "Open project →" : "Create project"}</button>
    </section>

    <div className="home-live-grid">
      <section className="home-live-panel" aria-labelledby="home-upcoming-title"><div className="home-live-heading"><div><p className="home-hub-eyebrow">NEXT UP</p><h2 id="home-upcoming-title">Upcoming tasks</h2></div><button type="button" className="btn-text" onClick={() => onNavigate("tasks")}>View tasks</button></div>{loading ? <div className="home-skeleton-list" aria-label="Loading tasks"><span /><span /><span /></div> : upcoming.length ? <ul className="home-task-list">{upcoming.map(task => <li key={task.id}><span className={task.due_date === today ? "home-task-dot is-today" : "home-task-dot"} /><div><strong>{task.title}</strong><small>{task.projectName} · {task.due_date === today ? "Due today" : `Due ${shortDate(task.due_date)}`}</small></div></li>)}</ul> : <div className="home-live-empty"><strong>No upcoming tasks.</strong><span>Add a task when you are ready to plan the next step.</span></div>}</section>
      <section className="home-live-panel" aria-labelledby="home-activity-title"><div className="home-live-heading"><div><p className="home-hub-eyebrow">RECENTLY CAPTURED</p><h2 id="home-activity-title">Activity</h2></div><button type="button" className="btn-text" onClick={() => onNavigate("entries")}>View entries</button></div>{loading ? <div className="home-skeleton-list" aria-label="Loading activity"><span /><span /><span /></div> : entries.length ? <ul className="home-entry-list">{entries.slice(0, 4).map(entry => <li key={entry.id}><div><strong>{entry.project_name || "Chronicles"}</strong><p>{Object.values(entry.data || {}).filter(Boolean).slice(0, 1).join(" ") || "Logbook entry"}</p></div><time>{shortDate(entry.created_at)}</time></li>)}</ul> : <div className="home-live-empty"><strong>No recent entries.</strong><span>Capture a short update to start building your work record.</span></div>}</section>
    </div>

    <section className="home-assistant-slot" aria-labelledby="assistant-slot-title"><span className="mira-mark" aria-label="Mira"><b>C</b><sup>M</sup></span><div><p className="home-hub-eyebrow">MIRA · YOUR ASSISTANT</p><h2 id="assistant-slot-title">A clearer way to capture your work</h2><p>Use Mira to think through ideas, updates, and better work habits.</p></div><button type="button" className="home-assistant-coming" onClick={() => onNavigate("assistant")}>Open Mira →</button></section>
  </section>
}
