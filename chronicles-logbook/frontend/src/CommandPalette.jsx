import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDialogFocus } from "./useDialogFocus"
import "./CommandPalette.css"

// The palette owns whether it is open, but the account menu needs to open it as
// well. A window event keeps that to one line at each end rather than threading
// state through every component that sits between them.
export const OPEN_COMMAND_PALETTE = "chronicles:open-command-palette"

export default function CommandPalette({ projects, onNavigate, onOpenProject, onCreateProject }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()
  // Escape-to-close and the focus trap live in useDialogFocus below; this
  // effect only owns the global Ctrl/Cmd+K toggle and the cross-component
  // open request, which apply whether or not the palette is currently open.
  useEffect(() => {
    const handleKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value) }
    }
    const handleOpenRequest = () => setOpen(true)
    window.addEventListener("keydown", handleKey)
    window.addEventListener(OPEN_COMMAND_PALETTE, handleOpenRequest)
    return () => {
      window.removeEventListener("keydown", handleKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE, handleOpenRequest)
    }
  }, [])
  const dialogRef = useDialogFocus(open, () => setOpen(false))
  // The trigger button and the dialog are mutually exclusive renders (see
  // the early return below), so it's already gone by the time useDialogFocus
  // tries to capture document.activeElement — its built-in return-focus
  // degrades to a no-op. Once the trigger remounts after closing, this
  // refocuses it directly instead, so keyboard/screen-reader users land back
  // where they were rather than at the top of the document.
  const triggerRef = useRef(null)
  const hasOpened = useRef(false)
  useEffect(() => {
    if (open) { hasOpened.current = true; return }
    if (hasOpened.current) triggerRef.current?.focus()
  }, [open])
  const commands = useMemo(() => [
    { label: "Go to Today", hint: "Overview", action: () => onNavigate("today") },
    { label: "Go to entries", hint: "Workspace", action: () => onNavigate("entries") },
    { label: "Go to tasks", hint: "Workspace", action: () => onNavigate("tasks") },
    { label: "Go to board", hint: "Workspace", action: () => onNavigate("board") },
    { label: "Go to outstanding work", hint: "Workspace", action: () => onNavigate("outstanding") },
    { label: "Go to calendar", hint: "Schedule", action: () => onNavigate("calendar") },
    { label: "Go to my dashboard", hint: "Dashboard", action: () => onNavigate("home") },
    { label: "Create a project", hint: "New", action: onCreateProject },
    { label: "Help & documentation", hint: "Help", action: () => navigate("/help") },
    // Picking a project by name opens that project. It used to land on Home
    // and leave the person to find it again, which made searching for one
    // pointless.
    ...projects.map(project => ({
      label: project.name,
      hint: "Project",
      action: () => (onOpenProject ? onOpenProject(project.id) : onNavigate("home")),
    })),
  ].filter(command => command.label.toLowerCase().includes(query.toLowerCase())), [projects, query, onNavigate, onOpenProject, onCreateProject, navigate])
  if (!open) return <button ref={triggerRef} className="command-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open command menu">⌘<span>Search</span><kbd>Ctrl K</kbd></button>
  return <div className="command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Command menu" tabIndex={-1} onMouseDown={event => event.stopPropagation()}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search commands, pages and projects…" /><p className="sr-only" role="status">{commands.length ? `${commands.length} matching ${plural(commands.length)}` : "No matching commands."}</p><div className="command-results">{commands.length ? commands.map(command => <button key={`${command.hint}-${command.label}`} type="button" onClick={() => { command.action(); setOpen(false) }}><span>{command.label}</span><small>{command.hint}</small></button>) : <p>No matching commands.</p>}</div><p className="command-help"><kbd>Esc</kbd> close · <kbd>Ctrl K</kbd> toggle</p></section></div>
}

function plural(count) {
  return count === 1 ? "command" : "commands"
}
