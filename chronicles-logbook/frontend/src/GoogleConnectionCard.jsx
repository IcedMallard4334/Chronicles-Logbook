import { useEffect, useMemo, useState } from "react"
import ChroniclesLogo from "./ChroniclesLogo"
import { fetchTasks } from "./api"
import "./GoogleConnectionCard.css"

function localDay(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value - offset).toISOString().slice(0, 10)
}

function dayLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(value)
}

export default function GoogleConnectionCard({ projects, onViewCalendar, onCreateProject }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const today = useMemo(() => localDay(), [])

  useEffect(() => {
    let active = true
    async function loadTasks() {
      setLoading(true)
      const results = await Promise.allSettled(projects.map(project => fetchTasks(project.id, false)))
      if (active) {
        setTasks(results.flatMap((result, index) => result.status === "fulfilled" ? result.value.map(task => ({ ...task, projectName: projects[index].name })) : []))
        setLoading(false)
      }
    }
    loadTasks()
    return () => { active = false }
  }, [projects])

  const dueToday = tasks.filter(task => task.due_date === today)
  const overdue = tasks.filter(task => task.due_date && task.due_date < today)
  const loggedToday = projects.flatMap(project => project.entries || []).filter(entry => String(entry.created_at || "").slice(0, 10) === today).length
  const nextTask = dueToday[0] || overdue[0]
  const status = overdue.length ? `${overdue.length} task${overdue.length === 1 ? "" : "s"} needs attention` : dueToday.length ? `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today` : "Your day is clear"

  return (
    <section className="today-home-card" aria-label="Today's Chronicles overview">
      <div className="today-home-heading">
        <div className="today-home-logo" aria-hidden="true"><ChroniclesLogo size={54} /></div>
        <div>
          <p className="today-home-eyebrow">CHRONICLES · TODAY</p>
          <h2>{dayLabel()}</h2>
          <p className="today-home-status"><span aria-hidden="true" />{loading ? "Bringing your day together…" : status}</p>
        </div>
      </div>
      <div className="today-home-insight">
        {nextTask ? <><strong>{nextTask.title}</strong><span>{overdue.length ? `Overdue · ${nextTask.projectName}` : `Due today · ${nextTask.projectName}`}</span></> : <><strong>{projects.length ? "A little space to focus." : "Start your first Chronicle."}</strong><span>{projects.length ? "Choose a project and make the next step count." : "Create a project to begin tracking your work."}</span></>}
      </div>
      <dl className="today-home-stats">
        <div><dt>Active projects</dt><dd>{projects.filter(project => !project.is_archived).length}</dd></div>
        <div><dt>Due today</dt><dd>{loading ? "–" : dueToday.length}</dd></div>
        <div><dt>Logged today</dt><dd>{loggedToday}</dd></div>
      </dl>
      <div className="today-home-actions">
        <button type="button" className="btn-primary" onClick={onViewCalendar}>Plan your day <span aria-hidden="true">→</span></button>
        <button type="button" className="btn-secondary" onClick={onCreateProject}>+ Create a project</button>
      </div>
    </section>
  )
}
