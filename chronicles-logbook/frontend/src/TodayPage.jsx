import { useEffect, useMemo, useState } from "react"
import { fetchEntriesGlobal, fetchTasks } from "./api"
import "./TodayPage.css"

const dayKey = () => new Date().toLocaleDateString("en-CA")
const prettyDate = () => new Intl.DateTimeFormat("en", {weekday:"long", day:"numeric", month:"long"}).format(new Date())

export default function TodayPage({ projects, onNavigate, onCreateProject }) {
  const [tasks, setTasks] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const today = useMemo(dayKey, [])
  useEffect(() => {
    let active = true
    Promise.allSettled([fetchEntriesGlobal({page:1,pageSize:8}), ...projects.map(project => fetchTasks(project.id, false))]).then(results => {
      if (!active) return
      setEntries(results[0].status === "fulfilled" ? results[0].value : [])
      setTasks(results.slice(1).flatMap((result, index) => result.status === "fulfilled" ? result.value.map(task => ({...task, projectName:projects[index].name})) : []))
      setLoading(false)
    })
    return () => { active = false }
  }, [projects])
  const overdue = tasks.filter(task => task.due_date && task.due_date < today)
  const due = tasks.filter(task => task.due_date === today)
  const logged = entries.filter(entry => String(entry.created_at || "").slice(0,10) === today)
  const health = projects.map(project => {
    const projectTasks = tasks.filter(task => task.projectName === project.name)
    const late = projectTasks.filter(task => task.due_date && task.due_date < today).length
    return {project, late, open:projectTasks.length, state:late ? "Needs attention" : projectTasks.length ? "In progress" : "Clear"}
  })
  return <section className="today-page" aria-label="Today workspace">
    <header className="today-page-header"><div><span className="workspace-eyebrow">FOCUSED WORKSPACE</span><h1>Today</h1><p>{prettyDate()} · A concise view of what needs your attention.</p></div><div className="today-page-actions"><button className="btn-secondary" type="button" onClick={() => onNavigate("calendar")}>Open calendar</button><button className="btn-primary" type="button" onClick={onCreateProject}>+ Create project</button></div></header>
    <div className="today-metrics"><article><span>Due today</span><strong>{loading ? "–" : due.length}</strong><small>Tasks with today’s deadline</small></article><article className={overdue.length ? "is-alert" : ""}><span>Needs attention</span><strong>{loading ? "–" : overdue.length}</strong><small>Overdue next actions</small></article><article><span>Logged today</span><strong>{loading ? "–" : logged.length}</strong><small>Entries captured so far</small></article><article><span>Active projects</span><strong>{projects.filter(project => !project.archived).length}</strong><small>Currently in your workspace</small></article></div>
    <div className="today-grid"><article className="today-panel"><div className="today-panel-heading"><h2>Next actions</h2><button type="button" onClick={() => onNavigate("tasks")}>View all tasks</button></div>{loading ? <p className="today-muted">Collecting your tasks…</p> : [...overdue, ...due].length ? <ol className="today-action-list">{[...overdue,...due].slice(0,6).map(task => <li key={task.id}><span className={task.due_date < today ? "today-priority is-overdue" : "today-priority"} /><div><strong>{task.title}</strong><small>{task.due_date < today ? "Overdue" : "Due today"} · {task.projectName}</small></div></li>)}</ol> : <div className="today-empty"><strong>Your task list is clear.</strong><span>Add a task to keep your next action visible here.</span><button type="button" className="btn-secondary" onClick={() => onNavigate("tasks")}>Open tasks</button></div>}</article><article className="today-panel"><div className="today-panel-heading"><h2>Project health</h2><button type="button" onClick={() => onNavigate("home")}>View projects</button></div>{health.length ? <ul className="today-health-list">{health.slice(0,6).map(item => <li key={item.project.id}><span>{item.project.name}</span><div><small className={item.late ? "is-overdue" : ""}>{item.state}</small><b>{item.open} open</b></div></li>)}</ul> : <div className="today-empty"><strong>No projects yet.</strong><span>Create one to begin your work record.</span><button type="button" className="btn-primary" onClick={onCreateProject}>Create project</button></div>}</article></div>
    <article className="today-panel today-recent"><div className="today-panel-heading"><h2>Recent logbook activity</h2><button type="button" onClick={() => onNavigate("entries")}>Open entries</button></div>{entries.length ? <ul className="today-entry-list">{entries.slice(0,5).map(entry => <li key={entry.id}><span>{entry.project_name || "Chronicles"}</span><p>{Object.values(entry.data || {}).filter(Boolean).slice(0,1).join(" ") || "Logbook entry"}</p><time>{new Date(entry.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short"})}</time></li>)}</ul> : <p className="today-muted">No recent entries. Capture a small update to start your record.</p>}</article>
  </section>
}
