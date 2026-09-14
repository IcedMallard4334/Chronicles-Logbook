import { useEffect, useMemo, useState } from "react"
import "./CommandPalette.css"

export default function CommandPalette({ projects, onNavigate, onCreateProject }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  useEffect(() => {
    const handleKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value) }
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])
  const commands = useMemo(() => [
    { label: "Go to Today", hint: "Dashboard", action: () => onNavigate("today") },
    { label: "Go to entries", hint: "Workspace", action: () => onNavigate("entries") },
    { label: "Go to tasks", hint: "Workspace", action: () => onNavigate("tasks") },
    { label: "Go to board", hint: "Workspace", action: () => onNavigate("board") },
    { label: "Go to outstanding work", hint: "Workspace", action: () => onNavigate("outstanding") },
    { label: "Go to calendar", hint: "Schedule", action: () => onNavigate("calendar") },
    { label: "Create a project", hint: "New", action: onCreateProject },
    ...projects.map(project => ({ label: project.name, hint: "Project", action: () => onNavigate("home") })),
  ].filter(command => command.label.toLowerCase().includes(query.toLowerCase())), [projects, query, onNavigate, onCreateProject])
  if (!open) return <button className="command-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open command menu">⌘<span>Search</span><kbd>Ctrl K</kbd></button>
  return <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Command menu" onMouseDown={event => event.stopPropagation()}><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search commands, pages and projects…" /><div className="command-results">{commands.length ? commands.map(command => <button key={`${command.hint}-${command.label}`} type="button" onClick={() => { command.action(); setOpen(false) }}><span>{command.label}</span><small>{command.hint}</small></button>) : <p>No matching commands.</p>}</div><p className="command-help"><kbd>Esc</kbd> close · <kbd>Ctrl K</kbd> toggle</p></section></div>
}
