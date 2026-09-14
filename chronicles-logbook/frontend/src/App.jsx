import { sendAIMessage, signOut } from "./api"
import { EntriesPage, TasksPage } from "./WorkspacePages"
import HomeWorkspace from "./HomeWorkspace"
import TodayPage from "./TodayPage"
import CommandPalette from "./CommandPalette"
import CalendarView from "./CalendarView"
import BoardView from "./BoardView"
import OutstandingPage from "./OutstandingPage"
import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"
import LogoIcon from "./ChroniclesLogo"
import { TaskPanel } from "./TaskPanel"
import OfflineStatus from "./OfflineStatus"
import DataTransfer from "./DataTransfer"
import { REJECTED, offlineQueue } from "./offlineQueue"
import { syncEngine } from "./offlineSync"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  archiveProject,
  createEntry,
  createProject,
  deleteAccount,
  fetchEntries,
  fetchEntriesGlobal,
  fetchEntryLinks,
  fetchFieldTimeline,
  fetchProjects,
  fetchStatistics,
  fetchTasks,
  previewSchemaChange,
  unarchiveProject,
  updateProject,
  updateSchema,
} from "./api"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  FIELD_TYPE_META,
  FIELD_TYPES,
  describeExpression,
  expressionCanonical,
  expressionError,
  expressionToDisplay,
  fieldTypeLabel,
  isNumericField,
  previewExpressionValue,
  referencedFieldIds,
  renameFieldInExpression,
  withComputedValues,
} from "./fieldTypes"
import "./App.css"
import "./tasks.css"

function generateId() {
  return `field-${Math.random().toString(36).slice(2, 9)}`
}

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

/** The signed-in user's id, used to scope the offline queue to them. */
function currentUserId() {
  try {
    return JSON.parse(window.localStorage.getItem("chronicles_user"))?.id || null
  } catch {
    return null
  }
}

/** Render a duration held in minutes as a compact "3h 20m". */
function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m"
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

const THEMES = ["light", "dark", "system"]

function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "system"
    return window.localStorage.getItem("chronicles-theme") || "system"
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === "system") {
      delete root.dataset.theme
    } else {
      root.dataset.theme = theme
    }
    window.localStorage.setItem("chronicles-theme", theme)
  }, [theme])

  const cycleTheme = () => {
    setTheme((current) => {
      const index = THEMES.indexOf(current)
      return THEMES[(index + 1) % THEMES.length]
    })
  }

  return [theme, cycleTheme]
}

function UserMenu({ userName, onSignOut, onDeleteAccount }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <span className="user-dropdown-name">{userName}</span>
          </div>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => { window.location.assign("/profile"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search</span>
          </button>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => { window.location.assign("/profile"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>Notifications</span>
          </button>
          <div className="user-dropdown-divider" />
          <DataTransfer onClose={() => setOpen(false)} />
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Analytics</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item user-dropdown-profile"
            role="menuitem"
            onClick={() => { window.location.assign("/profile"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => { onSignOut(); setOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign out</span>
          </button>
          <button
            type="button"
            className="user-dropdown-item user-dropdown-danger"
            role="menuitem"
            onClick={() => { onDeleteAccount(); setOpen(false); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete account</span>
          </button>
        </div>
      )}
    </div>
  )
}

function AuthActions() {
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return null

    try {
      return JSON.parse(window.localStorage.getItem("chronicles_user"))
    } catch {
      return null
    }
  })

  const [accountError, setAccountError] = useState("")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const clearSession = () => { signOut().catch(() => {}) }

  const openDeleteModal = () => {
    setAccountError("")
    setConfirmation("")
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return

    setConfirmation("")
    setShowDeleteModal(false)
  }

  const handleDelete = async () => {
    if (confirmation !== "DELETE") return

    setIsDeleting(true)
    setAccountError("")

    try {
      await deleteAccount()
      clearSession()
    } catch (error) {
      setAccountError(formatError(error))
      setIsDeleting(false)
    }
  }

  if (!user) return <a className="auth-link" href="/">Sign in</a>

  const initials = user.full_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <div className="account-actions">
        <div className="user-avatar" title={user.full_name}>
          {initials}
        </div>
        <UserMenu
          userName={user.full_name}
          onSignOut={clearSession}
          onDeleteAccount={openDeleteModal}
        />

        {accountError && (
          <span className="account-error" role="alert">
            {accountError}
          </span>
        )}
      </div>

      {showDeleteModal && (
        <div
          className="modal-backdrop"
          onClick={closeDeleteModal}
          role="presentation"
        >
          <div
            className="modal-card delete-account-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <LogoIcon className="modal-character" size={90} />

            <h2 id="delete-account-title">
              Delete your account?
            </h2>

            <p>
              This will permanently delete your Chronicles account
              and all of its projects, entries, and tasks.
            </p>

            <p className="delete-warning">
              This action cannot be undone.
            </p>

            <label className="field-label full">
              Type <strong>DELETE</strong> to confirm
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
                autoFocus
                disabled={isDeleting}
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-account-confirm"
                onClick={handleDelete}
                disabled={confirmation !== "DELETE" || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


function EmptyState({ onCreate, onSeedDemoData }) {
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <div className="empty-logo-hero">
          <LogoIcon size={72} />
          <h2>Welcome to Chronicles</h2>
          <p>Your digital logbook for tracking projects, entries, and progress.</p>
          <div className="empty-actions">
            <button type="button" className="btn-primary btn-lg" onClick={onCreate}>
              Create your first project
            </button>
            <button type="button" className="btn-secondary btn-lg" onClick={onSeedDemoData}>
              Load demo data
            </button>
          </div>
        </div>
        <div className="empty-features">
          <div className="empty-feature">
            <div className="empty-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h4>Custom schemas</h4>
            <span>Define your own fields per project</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h4>Quick capture</h4>
            <span>Log entries in seconds</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <h4>Tasks & deadlines</h4>
            <span>Stay on top of what's due</span>
          </div>
        </div>
      </div>
    </div>
  )
}



function CreateProjectModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  if (!isOpen) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate({ name: trimmed, description: description.trim() || null })
    setName("")
    setDescription("")
  }

  const handleCancel = () => {
    setName("")
    setDescription("")
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
      >
        <LogoIcon className="modal-character" size={90} />
        <h2 id="create-project-title">Start a new project</h2>
        <p>What would you like to call your logbook?</p>
        <form onSubmit={handleSubmit}>
          <label className="field-label full">
            Project name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Field Notes"
              autoFocus
            />
          </label>
          <label className="field-label full">
            Description (optional)
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this project for?"
              rows={3}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" aria-label="Confirm create project">
              Create project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditProjectModal({ isOpen, onClose, project, onSave }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen && project) {
      setName(project.name || "")
      setDescription(project.description || "")
      setError(null)
    }
  }, [isOpen, project])

  if (!isOpen) return null

  const handleCancel = () => {
    setError(null)
    onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Project name can't be empty.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await onSave({ name: trimmed, description: description.trim() || null })
      onClose()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
      >
        <LogoIcon className="modal-character" size={90} />
        <h2 id="edit-project-title">Edit project</h2>
        <p>Update the name and description for this logbook.</p>
        <form onSubmit={handleSubmit}>
          <label className="field-label full">
            Project name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Field Notes"
              autoFocus
            />
          </label>
          <label className="field-label full">
            Description (optional)
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this project for?"
              rows={3}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** The sidebar's status language for a project, read from its open tasks. */
function deriveProjectStatus(tasks, today) {
  const late = tasks.some((task) => task.due_date && task.due_date < today)
  return late ? "Needs attention" : tasks.length ? "In progress" : "On track"
}

/**
 * The status of each of a set of projects, as the sidebar shows it.
 *
 * A link to another project carries the same dot the sidebar does, so the
 * status has to be derived the same way — one rule, learned once, read
 * anywhere. Only the projects asked for are fetched, which for a link chip
 * means the one or two a schema points at.
 */
function useProjectStatuses(projectIds) {
  const [statuses, setStatuses] = useState({})
  const key = projectIds.join("\n")
  const ids = useMemo(() => (key ? key.split("\n") : []), [key])

  useEffect(() => {
    if (ids.length === 0) return undefined

    let active = true
    const today = new Date().toLocaleDateString("en-CA")
    Promise.allSettled(ids.map((id) => fetchTasks(id, false))).then((results) => {
      if (!active) return
      setStatuses(
        Object.fromEntries(
          results.map((result, index) => [
            ids[index],
            deriveProjectStatus(result.status === "fulfilled" ? result.value : [], today),
          ])
        )
      )
    })
    return () => {
      active = false
    }
  }, [ids])

  return statuses
}

/**
 * A project link as it reads among values: the target's name on the
 * sidebar's status dot, and — wherever a click can be acted on — the target
 * itself.
 *
 * The dot is what makes it read as a connection rather than as text: the
 * same green unless the project needs attention, exactly as the sidebar
 * shows it.
 */
function LinkChip({ targetId, projects, status, onOpen }) {
  const target = projects.find((project) => project.id === targetId)
  const content = (
    <>
      <span
        className={`log-link-dot ${status === "Needs attention" ? "is-attention" : ""}`}
        aria-hidden="true"
      />
      {target ? target.name : "A project you no longer have"}
    </>
  )

  if (!target || !onOpen) {
    return <span className="log-link-chip is-static">{content}</span>
  }

  return (
    <button
      type="button"
      className="log-link-chip"
      onClick={() => onOpen(targetId)}
      title={`Open ${target.name}`}
    >
      {content}
    </button>
  )
}

function ProjectList({ projects, statistics, selectedId, onSelect, onCreate, onShowHome, homeActive, onShowTimeline, timelineActive }) {
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState("")
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("chronicles-pinned-projects") || "[]") } catch { return [] }
  })
  const [projectState, setProjectState] = useState({})
  const activeProjects = projects.filter((project) => !project.archived)
  const archivedProjects = projects.filter((project) => project.archived)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleActiveProjects = activeProjects.filter((project) => `${project.name} ${project.description || ""}`.toLowerCase().includes(normalizedQuery))
  const visibleArchivedProjects = archivedProjects.filter((project) => `${project.name} ${project.description || ""}`.toLowerCase().includes(normalizedQuery))
  const totals = statistics?.totals

  useEffect(() => {
    let active = true
    const today = new Date().toLocaleDateString("en-CA")
    Promise.allSettled(activeProjects.map(project => fetchTasks(project.id, false))).then(results => {
      if (!active) return
      setProjectState(Object.fromEntries(results.map((result, index) => [
        activeProjects[index].id,
        deriveProjectStatus(result.status === "fulfilled" ? result.value : [], today),
      ])))
    })
    return () => { active = false }
  }, [projects])

  const togglePinned = (id) => setPinnedIds(current => {
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    window.localStorage.setItem("chronicles-pinned-projects", JSON.stringify(next))
    return next
  })

  return (
    <aside className="sidebar workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-sidebar-brand">
        <span className="workspace-sidebar-mark" aria-hidden="true">C</span>
        <div><strong>Workspace</strong><span>Projects and activity</span></div>
      </div>
      <nav className="workspace-sidebar-nav" aria-label="Workspace views">
        <button type="button" className={homeActive ? "is-active" : ""} onClick={onShowHome}>
          <span aria-hidden="true">⌂</span> Projects
        </button>
        <button type="button" className={timelineActive ? "is-active" : ""} onClick={onShowTimeline}>
          <span aria-hidden="true">◷</span> Activity
        </button>
      </nav>
      <div className="workspace-sidebar-stats" aria-label="Workspace summary">
        <span><strong>{activeProjects.length}</strong> active</span>
        <span><strong>{totals ? totals.entries : "–"}</strong> entries</span>
        <span><strong>{totals ? formatDuration(totals.time_spent) : "–"}</strong> logged</span>
        <span><strong>{totals ? totals.active_days : "–"}</strong> active days</span>
      </div>
      <div className="sidebar-head">
        <h2>Projects</h2>
        <button
          type="button"
          className="btn-icon"
          onClick={onCreate}
          aria-label="Create project"
          title="Create project"
        >
          +
        </button>
      </div>
      <label className="workspace-sidebar-search"><span className="sr-only">Search projects</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" /></label>
      {activeProjects.length === 0 && archivedProjects.length === 0 ? (
        <p className="sidebar-empty">No projects yet.</p>
      ) : (
        <>
          {visibleActiveProjects.length === 0 ? (
            <p className="sidebar-empty">{query ? "No matching projects." : "No active projects."}</p>
          ) : (
            <ul className="project-list" role="listbox" aria-label="Projects">
              {visibleActiveProjects.sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id))).map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={`project-button ${project.id === selectedId ? "active" : ""}`}
                    onClick={() => onSelect(project.id)}
                    role="option"
                    aria-selected={project.id === selectedId}
                  >
                    <span className="project-name">{project.name}</span>
                    <small className={projectState[project.id] === "Needs attention" ? "project-status is-attention" : "project-status"}>{projectState[project.id] || "Checking…"}</small>
                  </button>
                  <button type="button" className={`project-pin ${pinnedIds.includes(project.id) ? "is-pinned" : ""}`} onClick={() => togglePinned(project.id)} aria-label={`${pinnedIds.includes(project.id) ? "Unpin" : "Pin"} ${project.name}`} title={pinnedIds.includes(project.id) ? "Unpin project" : "Pin project"}>★</button>
                </li>
              ))}
            </ul>
          )}
          {visibleArchivedProjects.length > 0 && (
            <div className="archived-section">
              <button
                type="button"
                className="btn-text archived-toggle"
                onClick={() => setShowArchived((current) => !current)}
                aria-expanded={showArchived}
              >
                {showArchived ? "Hide" : "Show"} archived ({visibleArchivedProjects.length})
              </button>
              {showArchived && (
                <ul
                  className="project-list archived-list"
                  role="listbox"
                  aria-label="Archived projects"
                >
                  {visibleArchivedProjects.map((project) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        className={`project-button archived ${
                          project.id === selectedId ? "active" : ""
                        }`}
                        onClick={() => onSelect(project.id)}
                        role="option"
                        aria-selected={project.id === selectedId}
                      >
                        <span className="project-name">{project.name}</span>
                        <span className="archived-badge">Archived</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function DashboardPanel({ projects, onCreate }) {
  const activeProjects = projects.filter((p) => !p.archived)
  const totalEntries = projects.reduce((sum, p) => sum + (p.entries?.length || 0), 0)
  const recentEntries = projects
    .flatMap((p) =>
      (p.entries || []).map((entry) => ({
        ...entry,
        projectName: p.name,
        projectId: p.id,
      }))
    )
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4)

  const stats = [
    { label: "Active projects", value: activeProjects.length, icon: "layers" },
    { label: "Entries logged", value: totalEntries, icon: "file-text" },
    { label: "Tasks due", value: "—", icon: "check-circle" },
    { label: "Day streak", value: "—", icon: "trending-up" },
  ]

  const icons = {
    layers: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    "file-text": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    "check-circle": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    "trending-up": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  }

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <aside className="sidebar dashboard-panel" aria-label="Dashboard overview">
      <div className="sidebar-head">
        <h2>Overview</h2>
        <button
          type="button"
          className="btn-icon"
          onClick={onCreate}
          aria-label="Create project"
          title="Create project"
        >
          +
        </button>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon">{icons[stat.icon]}</div>
            <div className="stat-body">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-section">
        <h3>Recent activity</h3>
        {recentEntries.length === 0 ? (
          <p className="dashboard-empty">No entries yet. Create a project and log your first entry.</p>
        ) : (
          <ul className="activity-list" role="list">
            {recentEntries.map((entry) => (
              <li key={`${entry.projectId}-${entry.id}`} className="activity-item">
                <div className="activity-dot" />
                <div className="activity-body">
                  <span className="activity-title">{entry.projectName}</span>
                  <span className="activity-meta">{formatTimeAgo(entry.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dashboard-section">
        <h3>Upcoming deadlines</h3>
        <div className="deadline-item">
          <div className="deadline-dot" />
          <div className="deadline-body">
            <span className="deadline-title">Tasks & deadlines</span>
            <span className="deadline-meta">Coming soon</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

/**
 * A field as the API stores it, with the keys that do not apply to its type
 * left off.
 *
 * The builder keeps spare state on a field while it is being edited — the
 * options you typed before switching the type away from a choice — and
 * sending that would make an edit look bigger than it is in the review.
 *
 * Takes the whole schema because a calculation is sent by field id, the form
 * the server stores: however its references were written in the editor, the
 * payload — and the change comparison — see the same canonical form.
 */
function cleanField(field, schema) {
  const cleaned = { id: field.id, name: (field.name || "").trim(), type: field.type }
  if (field.type === "dropdown") cleaned.options = field.options || []
  if (field.type === "computed") {
    cleaned.expression = expressionCanonical((field.expression || "").trim(), schema)
  }
  if (field.type === "project_reference") {
    cleaned.linked_project_id = field.linked_project_id || null
  }
  return cleaned
}

const CHANGE_LABELS = {
  added: "New field",
  removed: "Removed",
  renamed: "Renamed",
  retyped: "Type changed",
  options_changed: "Choices changed",
  expression_changed: "Calculation changed",
  link_changed: "Link changed",
}

function plural(count, one, many) {
  return count === 1 ? one : many
}

/** What one change costs, in entries, or an empty string when it costs nothing. */
function impactSentence(change) {
  const parts = []
  if (change.values_coerced > 0) {
    parts.push(
      `${change.values_coerced} ${plural(change.values_coerced, "value", "values")} rewritten to fit`
    )
  }
  if (change.values_retired > 0) {
    parts.push(
      `${change.values_retired} ${plural(change.values_retired, "value", "values")} kept but hidden`
    )
  }
  if (parts.length === 0 && change.entries_affected > 0) {
    parts.push(
      `${change.entries_affected} ${plural(change.entries_affected, "entry", "entries")} updated`
    )
  }
  return parts.join(" · ")
}

/**
 * What an edit will do to entries already recorded, shown before it is saved.
 *
 * Editing a schema is the only action in the logbook that can change data the
 * user did not just type, so it is the only one that asks twice. The report
 * comes from the server, which produces it by running the real migration — so
 * this is what will happen, not an estimate of it.
 */
function SchemaChangeReview({ preview, onApply, onKeepEditing, isSaving }) {
  const hasWarnings = preview.changes.some((change) => change.severity === "warning")

  return (
    <div className="schema-review" role="region" aria-label="Review schema changes">
      <div className="panel-head">
        <h4>Review these changes</h4>
        <p>
          {preview.entries_affected} of {preview.entry_count}{" "}
          {plural(preview.entry_count, "entry", "entries")} already recorded will be
          updated.
        </p>
      </div>
      <ul className="change-list" role="list">
        {preview.changes.map((change) => (
          <li
            key={`${change.kind}-${change.field_id}`}
            className={`change-row is-${change.severity}`}
          >
            <span className="change-kind">{CHANGE_LABELS[change.kind] || change.kind}</span>
            <div className="change-detail">
              <p className="change-description">{change.description}</p>
              {impactSentence(change) && (
                <p className="change-impact">{impactSentence(change)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hasWarnings && (
        <p className="hint">
          Nothing is deleted. A value that no longer fits stays with its entry under
          <strong> No longer recorded</strong>, and comes back if you restore the field.
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={onKeepEditing}>
          Keep editing
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onApply}
          disabled={isSaving}
        >
          {isSaving ? "Applying…" : "Apply changes"}
        </button>
      </div>
    </div>
  )
}

/** One field as it reads when the schema is not being edited. */
function SchemaFieldSummary({ field, schema, projects }) {
  const target = projects.find((project) => project.id === field.linked_project_id)

  return (
    <div className="field-card is-readonly">
      <div className="field-summary">
        <span className="field-summary-name">{field.name}</span>
        <span className="field-summary-type">{fieldTypeLabel(field.type)}</span>
      </div>
      {field.type === "dropdown" && (
        <p className="field-summary-detail">{(field.options || []).join(" · ")}</p>
      )}
      {field.type === "computed" && (
        <p className="field-summary-detail">
          = {describeExpression(field.expression, schema)}
        </p>
      )}
      {field.type === "project_reference" && (
        <p className="field-summary-detail">
          Links to {target ? target.name : "a project you no longer have"}
        </p>
      )}
    </div>
  )
}

/** One field while the schema is being edited. */
function SchemaFieldEditor({ field, index, schema, latestData, linkable, onChange, onRemove }) {
  // A calculation can only read figures, and only from fields other than
  // itself, so those are the only ones offered as sources.
  const sources = schema.filter((other) => isNumericField(other) && other.id !== field.id)
  const problem =
    field.type === "computed" ? expressionError(field.expression, field, schema) : null

  // A formula is easier to trust once it has produced a number. The project's
  // latest entry answers it when it can, so what gets checked is a figure the
  // owner recognises rather than an abstract example.
  const preview =
    field.type === "computed" && !problem
      ? previewExpressionValue(field.expression, latestData, schema)
      : null

  return (
    <div className="field-card">
      <div className="field-row">
        <label className="field-label">
          Name
          <input
            type="text"
            value={field.name}
            onChange={(event) => onChange(index, { name: event.target.value })}
            placeholder="Field name"
          />
        </label>
        <label className="field-label">
          Type
          <select
            value={field.type}
            onChange={(event) =>
              onChange(index, {
                type: event.target.value,
                options: event.target.value === "dropdown" ? field.options || [""] : field.options,
                expression:
                  event.target.value === "computed" ? field.expression || "" : field.expression,
              })
            }
          >
            {FIELD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-type-hint">
        {FIELD_TYPES.find((type) => type.value === field.type)?.hint}
      </p>
      {field.type === "dropdown" && (
        <label className="field-label full">
          Options (comma-separated)
          <input
            type="text"
            value={(field.options || []).join(", ")}
            onChange={(event) =>
              onChange(index, {
                options: event.target.value
                  .split(",")
                  .map((option) => option.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Option 1, Option 2, Option 3"
          />
        </label>
      )}
      {field.type === "computed" && (
        <>
          <label className="field-label full">
            Calculation
            <input
              type="text"
              value={field.expression || ""}
              onChange={(event) => onChange(index, { expression: event.target.value })}
              placeholder="e.g. {Hours} * 60 — or click a field below"
            />
          </label>
          {sources.length > 0 ? (
            <div className="expression-sources">
              <span className="hint">Add a field:</span>
              {sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="btn-chip"
                  onClick={() =>
                    onChange(index, {
                      expression: `${field.expression || ""}${
                        field.expression ? " " : ""
                      }{${source.name}}`,
                    })
                  }
                >
                  {source.name || "Unnamed field"}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">
              Add a number field first — a calculation needs figures to work from.
            </p>
          )}
          {field.expression && !problem && (
            <p className="field-summary-detail">
              = {describeExpression(field.expression, schema)}
            </p>
          )}
          {preview && (
            <p className="expression-preview">
              Preview: {preview.value}
              {preview.fromEntry
                ? " — from your latest entry"
                : referencedFieldIds(field.expression).length > 0
                  ? " — with every field as 2"
                  : ""}
            </p>
          )}
          {problem && <p className="error">{problem}</p>}
        </>
      )}
      {field.type === "project_reference" &&
        (linkable.length > 0 ? (
          <label className="field-label full">
            Links to
            <select
              value={field.linked_project_id || ""}
              onChange={(event) =>
                onChange(index, { linked_project_id: event.target.value || null })
              }
            >
              <option value="">Choose a project…</option>
              {linkable.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hint">
            A link needs somewhere to point — create another project first.
          </p>
        ))}
      <button type="button" className="btn-text-danger" onClick={() => onRemove(index)}>
        Remove field
      </button>
    </div>
  )
}

/**
 * Define a project's fields, and change them once entries exist.
 *
 * Read-only until "Edit schema" is pressed. A schema is a decision about the
 * shape of everything already recorded, so it should not be possible to alter
 * one by clicking into a form while reading it.
 */
function SchemaBuilder({ project, projects, onPreview, onSave, disabled, onSwitchToEntries }) {
  const savedFields = useMemo(() => project.entry_schema || [], [project.entry_schema])

  // A project cannot link to itself, so its own entry is never offered as a
  // target.
  const linkable = useMemo(
    () => projects.filter((other) => other.id !== project.id),
    [projects, project.id]
  )

  // The most recent entry's figures, for previewing a calculation against
  // numbers the owner already recognises. The newest is found by date rather
  // than assumed from the list's order, since entries captured offline are
  // folded in ahead of whatever the server returned.
  const latestData = useMemo(() => {
    const entries = project.entries || []
    if (entries.length === 0) return null
    const latest = entries.reduce((newest, entry) =>
      new Date(entry.created_at) > new Date(newest.created_at) ? entry : newest
    )
    return latest.data || null
  }, [project.entries])

  const [mode, setMode] = useState("view")
  const [fields, setFields] = useState(savedFields)
  const [preview, setPreview] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedResult, setSavedResult] = useState(null)

  const hasChanges = useMemo(
    () =>
      JSON.stringify(fields.map((field) => cleanField(field, fields))) !==
      JSON.stringify(savedFields.map((field) => cleanField(field, savedFields))),
    [fields, savedFields]
  )

  // Returning to the read-only view once the saved schema changes is what ends
  // a successful edit; the notice is left in place, since it is the report of
  // the edit that just finished.
  useEffect(() => {
    setMode("view")
    setFields(savedFields)
    setPreview(null)
    setError(null)
  }, [project.id, savedFields])

  useEffect(() => {
    setSavedResult(null)
  }, [project.id])

  const startEditing = () => {
    setMode("edit")
    // A calculation is stored by field id but edited by field name: the name
    // is what the person who named the field knows it by, and the id never
    // was theirs to read.
    setFields(
      savedFields.map((field) =>
        field.type === "computed"
          ? { ...field, expression: expressionToDisplay(field.expression, savedFields) }
          : field
      )
    )
    setError(null)
    setSavedResult(null)
  }

  const cancelEditing = () => {
    setMode("view")
    setFields(savedFields)
    setPreview(null)
    setError(null)
  }

  const addField = () => {
    setFields((prev) => [...prev, { id: generateId(), name: "", type: "text", options: [] }])
  }

  const removeField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const updateField = (index, patch) => {
    setFields((prev) => {
      const next = prev.map((field, i) => (i === index ? { ...field, ...patch } : field))

      // Renaming a field renames it in every calculation that refers to it,
      // so a calculation keeps naming a field that exists rather than
      // quietly breaking the moment its source is renamed.
      if (patch.name !== undefined) {
        const oldName = (prev[index].name || "").trim()
        const newName = (patch.name || "").trim()
        if (oldName && newName && oldName !== newName) {
          return next.map((field) =>
            field.type === "computed"
              ? {
                  ...field,
                  expression: renameFieldInExpression(field.expression, oldName, newName),
                }
              : field
          )
        }
      }
      return next
    })
  }

  /**
   * The same rules the server enforces, checked here so a mistake is pointed
   * out beside the field rather than after a failed save.
   */
  const validateSchema = () => {
    const names = new Set()
    for (const field of fields) {
      const name = (field.name || "").trim()
      if (!name) return "Every field needs a name."
      if (names.has(name.toLowerCase())) return `Two fields are both called "${name}".`
      names.add(name.toLowerCase())

      // A calculation refers to a field by its name, so a brace in a name
      // would be read as half a reference — the same line the server holds.
      if (/{|}/.test(name)) {
        return `"${name}" cannot contain braces, because a calculation refers to a field by its name.`
      }
      if (field.type === "dropdown" && (field.options || []).length === 0) {
        return `"${name}" needs at least one option.`
      }
      if (field.type === "project_reference" && !field.linked_project_id) {
        return `"${name}" needs to say which project it links to.`
      }
      if (field.type === "computed") {
        const problem = expressionError(field.expression, field, fields)
        if (problem) return `"${name}": ${problem}`
      }
    }
    return null
  }

  const applyChanges = async () => {
    setIsSaving(true)
    setError(null)
    try {
      setSavedResult(await onSave(fields.map((field) => cleanField(field, fields))))
      setPreview(null)
      setMode("view")
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Ask the server what the edit would do, and only stop to ask the user when
   * the answer involves an entry they have already recorded.
   */
  const handleSave = async () => {
    const problem = validateSchema()
    if (problem) {
      setError(problem)
      return
    }

    setIsSaving(true)
    setError(null)
    let report
    try {
      report = await onPreview(fields.map((field) => cleanField(field, fields)))
    } catch (err) {
      setError(formatError(err))
      setIsSaving(false)
      return
    }
    setIsSaving(false)

    if (report.entries_affected === 0) {
      await applyChanges()
      return
    }

    setPreview(report)
    setMode("review")
  }

  if (mode === "review" && preview) {
    return (
      <div className="schema-builder">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <SchemaChangeReview
          preview={preview}
          isSaving={isSaving}
          onApply={applyChanges}
          onKeepEditing={() => {
            setPreview(null)
            setMode("edit")
          }}
        />
      </div>
    )
  }

  const isEditing = mode === "edit"

  return (
    <div className="schema-builder">
      <div className="panel-head">
        <h3>Entry schema</h3>
        <p>
          {isEditing
            ? "Existing entries are brought along with any change you make."
            : "The fields this logbook asks for."}
        </p>
      </div>
      {fields.length === 0 ? (
        <p className="hint">
          {isEditing ? "No fields yet. Add one to get started." : "No fields defined yet."}
        </p>
      ) : (
        <div className="field-list">
          {isEditing
            ? fields.map((field, index) => (
                <SchemaFieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  schema={fields}
                  latestData={latestData}
                  linkable={linkable}
                  onChange={updateField}
                  onRemove={removeField}
                />
              ))
            : fields.map((field) => (
                <SchemaFieldSummary key={field.id} field={field} schema={fields} projects={projects} />
              ))}
        </div>
      )}
      {!isEditing && project.retired_schema?.length > 0 && (
        <p className="hint">
          {project.retired_schema.length}{" "}
          {plural(project.retired_schema.length, "field is", "fields are")} no longer asked
          for. What past entries recorded under{" "}
          {plural(project.retired_schema.length, "it", "them")} is still kept.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {savedResult && (
        <div className="success" role="status">
          <p>
            Schema saved.
            {savedResult.entries_affected > 0 &&
              ` ${savedResult.entries_affected} ${plural(
                savedResult.entries_affected,
                "entry was",
                "entries were"
              )} updated to match.`}
          </p>
          <button type="button" className="btn-text" onClick={onSwitchToEntries}>
            Go to Entries to start logging
          </button>
        </div>
      )}
      <div className="actions">
        {isEditing ? (
          <>
            <button type="button" className="btn-secondary" onClick={addField}>
              Add field
            </button>
            <button type="button" className="btn-text" onClick={cancelEditing}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={disabled || isSaving || !hasChanges}
            >
              {isSaving ? "Checking…" : "Save schema"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={startEditing}
            disabled={disabled}
          >
            {fields.length === 0 ? "Define schema" : "Edit schema"}
          </button>
        )}
      </div>
    </div>
  )
}

function TagsInput({ value, onChange }) {
  const [input, setInput] = useState("")

  const addTag = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
    setInput("")
  }

  const removeTag = (tag) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="tags-input">
      <div className="tags-list">
        {value.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? "Type and press Enter…" : ""}
      />
    </div>
  )
}

function ChecklistInput({ value, onChange }) {
  const [input, setInput] = useState("")

  const addItem = () => {
    const text = input.trim()
    if (text) {
      onChange([
        ...value,
        { id: `ci-${Math.random().toString(36).slice(2, 9)}`, text, completed: false },
      ])
    }
    setInput("")
  }

  const toggleItem = (id) => {
    onChange(value.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ))
  }

  const removeItem = (id) => {
    onChange(value.filter((item) => item.id !== id))
  }

  const moveItem = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addItem()
    }
  }

  return (
    <div className="checklist-input">
      {value.map((item, index) => (
        <div key={item.id} className="checklist-item">
          <input
            type="checkbox"
            checked={item.completed}
            onChange={() => toggleItem(item.id)}
          />
          <span className={item.completed ? "checklist-done" : ""}>
            {item.text}
          </span>
          <div className="checklist-actions">
            <button
              type="button"
              className="btn-text-small"
              onClick={() => moveItem(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-text-small"
              onClick={() => moveItem(index, 1)}
              disabled={index === value.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="btn-text-small btn-text-danger"
              onClick={() => removeItem(item.id)}
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <div className="checklist-add">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item and press Enter…"
        />
      </div>
      {value.length > 0 && (
        <span className="checklist-count">
          {value.filter((i) => i.completed).length}/{value.length} complete
        </span>
      )}
    </div>
  )
}

function LinkInput({ value, onChange, entries }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="link-select"
    >
      <option value="">No link</option>
      {entries.map((entry) => {
        // Build a preview from the first text field value
        const preview = Object.values(entry.data || {})
          .find((v) => typeof v === "string") || entry.id.slice(0, 8)
        return (
          <option key={entry.id} value={entry.id}>
            {String(preview).slice(0, 60)} — {new Date(entry.created_at).toLocaleDateString()}
          </option>
        )
      })}
    </select>
  )
}

/**
 * One field on the new-entry form.
 *
 * A calculation is shown rather than asked for (US-2.5): it is worked out from
 * the figures beside it, so an input would invite someone to type a value the
 * server would immediately overwrite.
 */
function EntryFieldInput({ field, value, computed, projects, status, onOpenProject, onChange }) {
  if (field.type === "computed") {
    // The badge's word and colour come from the field-type registry, so the
    // form, the table and the schema view can never disagree about what a
    // type is called or how it is marked.
    const meta = FIELD_TYPE_META[field.type]
    return (
      <div className="field-label is-computed">
        <span className="field-label-text">
          {field.name}
          <span className={`field-readonly-tag is-${meta.color}`}>{meta.badge}</span>
        </span>
        <output className="computed-value">
          {computed === null || computed === undefined ? "—" : computed}
        </output>
      </div>
    )
  }

  // A link is decided once, in the schema (US-2.4), rather than answered
  // on every entry — so it is shown rather than asked for. The value is the
  // same chip the entry list shows: the target's name on its status dot,
  // clickable through to the project. A boxed read-out would read as a text
  // box awaiting input; a chip reads as a thing you act on.
  if (field.type === "project_reference") {
    const meta = FIELD_TYPE_META[field.type]
    return (
      <div className="field-label is-computed">
        <span className="field-label-text">
          {field.name}
          <span className={`field-readonly-tag is-${meta.color}`}>{meta.badge}</span>
        </span>
        {field.linked_project_id ? (
          <LinkChip
            targetId={field.linked_project_id}
            projects={projects}
            status={status}
            onOpen={onOpenProject}
          />
        ) : (
          <output className="computed-value is-link">—</output>
        )}
      </div>
    )
  }

  return (
    <label className="field-label">
      {field.name}
      {field.type === "dropdown" ? (
        <select value={value || ""} onChange={(e) => onChange(field.id, e.target.value)} required>
          <option value="" disabled>
            Select…
          </option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          value={value || ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.name}
          required
        />
      )}
    </label>
  )
}

function EntryForm({ project, projects = [], onCreated, onOpenProject }) {
  const schema = useMemo(() => project.entry_schema || [], [project.entry_schema])
  const [data, setData] = useState({})
  const [hoursSpent, setHoursSpent] = useState("")
  const [minutesSpent, setMinutesSpent] = useState("")
  const [todo, setTodo] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [projectEntries, setProjectEntries] = useState([])

  // Load existing entries for the link field selector
  useEffect(() => {
    const hasLinkField = schema.some((f) => f.type === "link")
    if (hasLinkField) {
      fetchEntries(project.id)
        .then(setProjectEntries)
        .catch(() => setProjectEntries([]))
    }
  }, [project.id, schema])

  // Recomputed as you type, so a calculation settles while the entry is being
  // filled in rather than only after it is saved.
  const computed = useMemo(() => withComputedValues(data, schema), [data, schema])

  // A link to the project you are already in carries no information, so it is
  // not offered.
  const linkable = useMemo(
    () => projects.filter((other) => other.id !== project.id),
    [projects, project.id]
  )

  // The status of every project this schema links to, for the chips in the
  // form — one rule, one dot, learned in the sidebar and read anywhere.
  const linkedIds = useMemo(
    () => [
      ...new Set(
        schema
          .filter((field) => field.type === "project_reference" && field.linked_project_id)
          .map((field) => field.linked_project_id)
      ),
    ],
    [schema]
  )
  const statuses = useProjectStatuses(linkedIds)

  useEffect(() => {
    setData({})
    setHoursSpent("")
    setMinutesSpent("")
    setTodo(false)
    setDueDate("")
    setError(null)
  }, [project.id])

  const handleChange = (fieldId, value) => {
    setData((prev) => ({ ...prev, [fieldId]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (schema.length === 0) {
      setError("Define an entry schema before adding entries.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const payload = {}
      for (const field of schema) {
        // The server derives calculations and links itself — a calculation
        // from the figures beside it, a link from the schema's own target —
        // so sending either would be a guess it has to ignore.
        if (field.type === "computed" || field.type === "project_reference") continue
        const value = data[field.id]
        if (field.type === "number") {
          payload[field.id] = value === undefined ? undefined : Number(value)
        } else if (value !== undefined) {
          payload[field.id] = value
        }
        if (payload[field.id] === undefined) delete payload[field.id]
        // Ensure new field types always have a value, even when the user
        // didn't interact with them — the backend requires every schema
        // field to be present.
        if (field.type === "tags" && payload[field.id] === undefined) {
          payload[field.id] = []
        }
        if (field.type === "checklist" && payload[field.id] === undefined) {
          payload[field.id] = []
        }
        if (field.type === "link" && payload[field.id] === undefined) {
          payload[field.id] = ""
        }
      }
      const hours = hoursSpent === "" ? 0 : Number(hoursSpent)
      const minutes = minutesSpent === "" ? 0 : Number(minutesSpent)
      const timeSpent = hours * 60 + minutes
      await onCreated({
        data: payload,
        time_spent: timeSpent === 0 ? null : timeSpent,
        todo,
        // Sent as null rather than "" so the server reads it as "no deadline"
        // instead of rejecting an empty date.
        due_date: dueDate || null,
      })
      setData({})
      setHoursSpent("")
      setMinutesSpent("")
      setTodo(false)
      setDueDate("")
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  if (schema.length === 0) {
    return (
      <div className="hint-card">
        <p>This project has no entry schema yet.</p>
        <p>
          Switch to the <strong>Schema</strong> tab to define fields.
        </p>
      </div>
    )
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="panel-head">
        <h3>New entry</h3>
      </div>
      <div className="form-grid">
        {schema.map((field) => (
          <EntryFieldInput
            key={field.id}
            field={field}
            value={data[field.id]}
            computed={computed[field.id]}
            projects={linkable}
            status={statuses[field.linked_project_id]}
            onOpenProject={onOpenProject}
            onChange={handleChange}
          />
        ))}
      </div>
      <div className="form-grid time-tracking">
        <label className="field-label">
          Hours spent
          <input
            type="number"
            min={0}
            value={hoursSpent}
            onChange={(e) => setHoursSpent(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="field-label">
          Minutes spent
          <input
            type="number"
            min={0}
            max={59}
            value={minutesSpent}
            onChange={(e) => setMinutesSpent(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>
      {/* Logging something that has not happened yet: it is planned work, so it
          belongs in the outstanding view rather than the record of what was done. */}
      <div className="form-grid entry-outstanding">
        <label className="field-label checkbox-label">
          <input
            type="checkbox"
            checked={todo}
            onChange={(e) => setTodo(e.target.checked)}
          />
          This is still to do
        </label>
        <label className="field-label">
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save entry"}
        </button>
      </div>
    </form>
  )
}

/**
 * A stored value as it should read on the page.
 *
 * A reference is held as a project id, which is the right thing to store and
 * the wrong thing to show, so it is resolved to the project's name here.
 */
function formatEntryValue(field, value, projectNames) {
  if (value === null || value === undefined || value === "") return "—"
  if (field?.type === "project_reference") {
    return projectNames.get(value) || "A project you no longer have"
  }
  return String(value)
}

/**
 * What an entry recorded under fields the schema has since dropped (US-2.7).
 *
 * Removing a field stops it being asked for; it does not erase what was already
 * answered. That history is kept out of the way but never out of reach.
 */
function RetiredValues({ retiredData, retiredSchema }) {
  const fields = retiredSchema.filter(
    (field) => retiredData[field.id] !== undefined && retiredData[field.id] !== null
  )
  if (fields.length === 0) return null

  return (
    <details className="retired-values">
      <summary>No longer recorded ({fields.length})</summary>
      <div className="log-fields">
        {fields.map((field) => (
          <div key={field.id} className="log-field">
            <span className="log-label">{field.name}</span>
            <span className="log-value">{String(retiredData[field.id])}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

function EntryList({ entries, schema, retiredSchema = [], projects = [], onOpenProject }) {
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  )

  // The status of every project this schema links to, for the chips below.
  const linkedIds = useMemo(
    () => [
      ...new Set(
        (schema || [])
          .filter((field) => field.type === "project_reference")
          .map((field) => field.linked_project_id)
          .filter(Boolean)
      ),
    ],
    [schema]
  )
  const statuses = useProjectStatuses(linkedIds)

  if (entries.length === 0) {
    return <p className="hint">No entries yet.</p>
  }

  // A column header is asked to be short; the full name rides along as a
  // tooltip so nothing is lost.
  const shortLabel = (name) => (name.length > 20 ? `${name.slice(0, 19)}…` : name)

  return (
    <div className="entry-list">
      <h3>Recent entries</h3>
      <ul className="log-list" role="list">
        {entries.map((entry) => {
          // Recomputed rather than read back: an entry captured offline holds
          // no stored calculation until it syncs, and the current formula is
          // the honest answer either way. What the server stored agrees with
          // it, because every write and every schema change re-derives.
          const data = withComputedValues(entry.data || {}, schema)
          return (
            <li
              key={entry.id}
              className={`log-row ${entry.pending ? "is-unsynced" : ""}`}
            >
              <div className="log-fields">
                {schema.map((field) => {
                  const meta = FIELD_TYPE_META[field.type]
                  return (
                    <div
                      key={field.id}
                      className={`log-field ${isNumericField(field) ? "is-numeric" : ""}`}
                    >
                      <span className="log-label" title={field.name}>
                        {shortLabel(field.name)}
                        {/* The two special columns carry a quiet dot in their
                            header — the registry's colours at a size that does
                            not compete with the values, the word on hover. */}
                        {meta?.badge && (
                          <span
                            className={`log-type-dot is-${meta.color}`}
                            title={meta.badge}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="log-value">
                        {field.type === "project_reference" && data[field.id] ? (
                          <LinkChip
                            targetId={data[field.id]}
                            projects={projects}
                            status={statuses[data[field.id]]}
                            onOpen={onOpenProject}
                          />
                        ) : (
                          formatEntryValue(field, data[field.id], projectNames)
                        )}
                        {/* Marked so a derived figure is never mistaken for one
                            that was typed in. */}
                        {field.type === "computed" && (
                          <span
                            className="calculated-badge"
                            title="Calculated from the other fields on this entry"
                            aria-hidden="true"
                          >
                            ƒ
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
              <span className="log-time">
                {/* Entries captured offline are shown immediately, so that
                    nobody re-types one believing it failed to save. */}
                {entry.pending && (
                  <span
                    className={`sync-badge ${entry.rejected ? "is-rejected" : ""}`}
                  >
                    {entry.rejected ? "Needs attention" : "Not yet synced"}
                  </span>
                )}
                {new Date(entry.created_at).toLocaleString()}
              </span>
              {/* Last, and collapsed: history worth keeping is not history worth
                  leading with. */}
              <RetiredValues
                retiredData={entry.retired_data || {}}
                retiredSchema={retiredSchema}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Timeline({ projects }) {
  const [projectId, setProjectId] = useState("")
  const [fieldId, setFieldId] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId],
  )

  const fields = selectedProject?.entry_schema || []

  useEffect(() => {
    setFieldId("")
    setTimeline(null)
    setError(null)
  }, [projectId])

  const handleLoadTimeline = async (event) => {
    event.preventDefault()

    if (!projectId || !fieldId) {
      setError("Please select a project and field.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await fetchFieldTimeline(
        projectId,
        fieldId,
        start ? `${start}T00:00:00` : null,
        end ? `${end}T23:59:59` : null,
      )
      setTimeline(data)
    } catch (err) {
      setTimeline(null)
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }

  const selectedField = fields.find((field) => field.id === fieldId)

  return (
    <section className="timeline" aria-label="Field timeline">
      <header className="timeline-header">
        <h2>Field Timeline</h2>
        <p>Choose a field and date range to visualise how its values change over time.</p>
      </header>

      <form className="timeline-filters" onSubmit={handleLoadTimeline}>
        <label className="field-label">
          Project
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Select project"
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Field
          <select
            value={fieldId}
            onChange={(event) => setFieldId(event.target.value)}
            disabled={!projectId}
            aria-label="Select field"
          >
            <option value="">Select a field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Start date
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-label="Start date"
          />
        </label>

        <label className="field-label">
          End date
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            aria-label="End date"
          />
        </label>

        <button
          type="submit"
          className="primary-button"
          disabled={loading || !projectId || !fieldId}
        >
          {loading ? "Loading…" : "Generate timeline"}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !timeline && (
        <p className="hint">
          Select a project, field, and optional date range, then generate the timeline.
        </p>
      )}

      {timeline && (
        <div className="timeline-results">
          <div className="timeline-summary">
            <h3>{timeline.field_name}</h3>
            <p>
              {timeline.points.length} data point
              {timeline.points.length === 1 ? "" : "s"}
              {selectedField?.type && (
                <span className="timeline-field-type"> • {selectedField.type}</span>
              )}
            </p>
          </div>

          {timeline.points.length === 0 ? (
            <p className="hint">No values found for this field in the selected range.</p>
          ) : (
            <>
              <div className="timeline-chart" aria-label={`${timeline.field_name} over time`}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart
                    data={timeline.points.map((point) => ({
                      ...point,
                      date: new Date(point.created_at).toLocaleDateString(),
                      displayValue: String(point.value),
                      numericValue:
                        timeline.field_type === "number" ? Number(point.value) : null,
                    }))}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={timeline.field_type === "number" ? "numericValue" : "displayValue"}
                    name={timeline.field_name}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="timeline-table-wrapper">
              <table className="timeline-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Value</th>
                    <th scope="col">Schema version</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.points.map((point) => (
                    <tr key={point.entry_id}>
                      <td>{new Date(point.created_at).toLocaleString()}</td>
                      <td>{String(point.value)}</td>
                      <td>{point.schema_version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      )}
    </section>
  )
}

function ProjectDetail({
  project,
  projects,
  onSchemaPreview,
  onSchemaSaved,
  onEntryCreated,
  onEditProject,
  onToggleArchive,
  onOpenProject,
}) {
  const [tab, setTab] = useState("entries")

  useEffect(() => {
    setTab("entries")
  }, [project.id])

  return (
    <section className="project-detail">
      <header className="detail-header">
        <div>
          <div className="project-title-row">
            <h2>{project.name}</h2>
            {project.archived && <span className="status-badge archived-badge">Archived</span>}
            <button
              type="button"
              className="btn-icon"
              onClick={onEditProject}
              aria-label="Edit project"
              title="Edit project"
            >
              ✎
            </button>
          </div>
          {project.description && <p className="detail-description">{project.description}</p>}
          <p className="detail-meta">
            {/* The field count sits exactly where someone is looking at
                field-related content, so it doubles as a way to reach the
                schema rather than waiting to be found in the tab bar. */}
            <button type="button" className="meta-pill" onClick={() => setTab("schema")}>
              {project.entry_schema?.length || 0}{" "}
              {project.entry_schema?.length === 1 ? "field" : "fields"} · Schema
            </button>
          </p>
        </div>
        <div className="tab-switch" role="tablist" aria-label="Project tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "entries"}
            className={tab === "entries" ? "active" : ""}
            onClick={() => setTab("entries")}
          >
            Entries
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "schema"}
            className={tab === "schema" ? "active" : ""}
            onClick={() => setTab("schema")}
          >
            Schema
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tasks"}
            className={tab === "tasks" ? "active" : ""}
            onClick={() => setTab("tasks")}
          >
            Tasks
          </button>
        </div>
      </header>
      <div className="detail-body">
        {tab === "entries" ? (
          <>
            {project.archived ? (
              <div className="hint-card" role="status">
                <p>This project is archived. Unarchive it to add new entries.</p>
              </div>
            ) : (
              <EntryForm project={project} projects={projects} onCreated={onEntryCreated} onOpenProject={onOpenProject} />
            )}
            <EntryList
              entries={project.entries || []}
              schema={project.entry_schema || []}
              retiredSchema={project.retired_schema || []}
              projects={projects}
              onOpenProject={onOpenProject}
            />
          </>
        ) : tab === "schema" ? (
          <SchemaBuilder
            project={project}
            projects={projects}
            onPreview={onSchemaPreview}
            onSave={onSchemaSaved}
            disabled={project.archived}
            onSwitchToEntries={() => setTab("entries")}
          />
        ) : (
          <TaskPanel projectId={project.id} />
        )}
      </div>
      <footer className="detail-footer">
        <button
          type="button"
          className="btn-secondary detail-archive-btn"
          onClick={onToggleArchive}
        >
          {project.archived ? "Unarchive project" : "Archive project"}
        </button>
      </footer>
    </section>
  )
}

async function seedDemoData() {
  const demoProjects = [
    { name: "Field Notes", description: "Daily observations and quick captures" },
    { name: "Thesis Research", description: "Literature review and experiment logs" },
    { name: "Side Project", description: "UI experiments and design iterations" },
  ]

  const created = []
  for (const project of demoProjects) {
    const p = await createProject({ ...project, entry_schema: [] })
    created.push(p)
  }

  const now = new Date()
  let entryId = 1
  const projectsWithEntries = created.map((project, projectIndex) => {
    const offsets = [-14, -10, -7, -5, -3, -2, -1, 0]
    const projectEntries = offsets
      .filter((_, i) => projectIndex !== 2 || i < 5)
      .map((offset, i) => {
        const date = new Date(now)
        date.setDate(date.getDate() + offset)
        date.setHours(9 + ((i + projectIndex * 3) % 10), ((i * 13) % 60), 0, 0)
        return {
          id: `demo-entry-${entryId++}`,
          project_id: project.id,
          data: {},
          created_at: date.toISOString(),
        }
      })
    return { ...project, entries: projectEntries }
  })

  return projectsWithEntries
}

function App() {
  const [projects, setProjects] = useState([])
  const [statistics, setStatistics] = useState(null)
  const [offlineNotice, setOfflineNotice] = useState(null)
  const [queuedEntries, setQueuedEntries] = useState([])
  const userId = useMemo(currentUserId, [])
  const pendingBefore = useRef(0)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState("project")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [miraMessages, setMiraMessages] = useState([])
  const [miraSending, setMiraSending] = useState(false)
  const [miraError, setMiraError] = useState(null)
  const [miraPendingAction, setMiraPendingAction] = useState(null)
  const [miraActionSaving, setMiraActionSaving] = useState(false)
  const [miraOpen, setMiraOpen] = useState(false)
  const miraSequence = useRef(0)
  const miraActionSavingRef = useRef(false)
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const validViews = ["home", "today", "assistant", "entries", "tasks", "board", "outstanding", "calendar"]
    const requestedView = params.get("view")
    const startView = window.localStorage.getItem("chronicles-start-view")
    return params.has("calendar_connected") || params.has("calendar_error")
      ? "calendar"
      : validViews.includes(requestedView)
        ? requestedView
        : validViews.includes(startView)
          ? startView
          : "home"
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set("view", currentView)
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`)
  }, [currentView])

  const sendMiraMessage = useCallback(async (message) => {
    const trimmed = message.trim()
    if (!trimmed || miraSending) return
    const id = ++miraSequence.current
    setMiraMessages(previous => [...previous, { id: `user-${id}`, role: "user", content: trimmed }])
    setMiraSending(true)
    setMiraError(null)
    try {
      const response = await sendAIMessage(trimmed)
      if (response?.action) {
        setMiraPendingAction(response.action)
      } else {
        const reply = response?.reply?.trim()
        if (!reply) throw new Error("Mira did not return a reply.")
        setMiraMessages(previous => [...previous, { id: `mira-${id}`, role: "assistant", content: reply }])
      }
    } catch {
      setMiraError({ message: "Mira could not reply just now. Please try again.", retryMessage: trimmed })
    } finally {
      setMiraSending(false)
    }
  }, [miraSending])

  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleMiraProjectConfirmation = useCallback(async () => {
    const action = miraPendingAction
    const name = action?.type === "create_project" ? action.payload?.name?.trim() : ""
    const description = action?.payload?.description?.trim() || null
    if (!name) {
      setMiraError({ message: "This project proposal is invalid. Please ask Mira again.", retryMessage: null })
      return
    }
    if (projects.some(project => project.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMiraError({ message: "A project with this name already exists. Choose a different name or cancel this proposal.", retryMessage: null })
      return
    }
    if (miraActionSavingRef.current) return
    miraActionSavingRef.current = true
    setMiraActionSaving(true)
    setMiraError(null)
    try {
      const project = await createProject({ name, description, entry_schema: [] })
      const refreshed = await fetchProjects()
      setProjects(refreshed)
      setMiraPendingAction(null)
      setMiraMessages(previous => [...previous, { id: `mira-created-${project.id}`, role: "assistant", content: `Created “${project.name}”. You can open it whenever you are ready.`, projectId: project.id }])
    } catch (err) {
      setMiraError({ message: formatError(err), retryMessage: null })
    } finally {
      miraActionSavingRef.current = false
      setMiraActionSaving(false)
    }
  }, [miraPendingAction, projects])

  const openMiraProject = useCallback((projectId) => {
    setView("project")
    setSelectedId(projectId)
    setCurrentView("home")
  }, [])

  const miraConversation = {
    messages: miraMessages,
    sending: miraSending,
    error: miraError,
    pendingAction: miraPendingAction,
    actionSaving: miraActionSaving,
    onSend: sendMiraMessage,
    onConfirmAction: handleMiraProjectConfirmation,
    onCancelAction: () => { setMiraPendingAction(null); setMiraError(null) },
    onOpenProject: openMiraProject,
    onClear: () => { setMiraMessages([]); setMiraError(null); setMiraPendingAction(null) },
  }

  useEffect(() => {
    loadProjects()
  }, [loadProjects])


  // Totals come from the server rather than being counted in the browser.
  // Counting locally was wrong: `entries` is only ever loaded for the project
  // currently open, so a client-side sum reported that one project's count as
  // though it were the whole logbook.
  //
  // Keyed on `projects` because every action that changes the figures —
  // creating a project, archiving one, saving an entry — replaces that array.
  useEffect(() => {
    let current = true

    fetchStatistics()
      .then((data) => {
        if (current) setStatistics(data)
      })
      .catch(() => {
        // The summary is supplementary; the workspace stays usable without it.
        if (current) setStatistics(null)
      })

    return () => {
      current = false
    }
  }, [projects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId]
  )

  /**
   * The open project, with anything captured offline folded into its entry
   * list.
   *
   * Without this an entry logged offline is invisible until it syncs, and
   * someone would reasonably re-type it — producing a real duplicate, since
   * the retyped copy gets a different id.
   *
   * Queued records carry the id the entry will be created with, so once one
   * syncs the server copy arrives with the same id and is filtered out here
   * rather than appearing twice.
   */
  const openProject = useMemo(() => {
    if (!selectedProject) return null

    const saved = selectedProject.entries || []
    const savedIds = new Set(saved.map((entry) => entry.id))

    const unsynced = queuedEntries
      .filter((record) => record.projectId === selectedProject.id)
      .filter((record) => !savedIds.has(record.id))
      .map((record) => ({
        id: record.id,
        project_id: record.projectId,
        data: record.data,
        time_spent: record.timeSpent,
        created_at: record.capturedAt,
        pending: true,
        rejected: record.status === REJECTED,
      }))

    if (unsynced.length === 0) return selectedProject

    return {
      ...selectedProject,
      entries: [...unsynced, ...saved].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      ),
    }
  }, [selectedProject, queuedEntries])

  const refreshQueued = useCallback(async () => {
    if (!userId) return
    try {
      setQueuedEntries(await offlineQueue.all(userId))
    } catch {
      // No local storage available — nothing can be queued, so nothing to show.
      setQueuedEntries([])
    }
  }, [userId])

  useEffect(() => {
    refreshQueued()
  }, [refreshQueued])


  const handleCreateProject = async ({ name, description }) => {
    try {
      const project = await createProject({ name, description, entry_schema: [] })
      setProjects((prev) => [...prev, project])
      setView("project")
      setSelectedId(project.id)
      setIsModalOpen(false)
    } catch (err) {
      setError(formatError(err))
    }
  }

  const handleSelectProject = (id) => {
    setView("project")
    setSelectedId(id)
    setCurrentView("home")
  }

  const handleShowTimeline = () => {
    setView("timeline")
    setSelectedId(null)
    setCurrentView("home")
  }

  const handleSeedDemoData = async () => {
    try {
      const data = await seedDemoData()
      setProjects(data)
      if (data.length > 0) {
        setSelectedId(data[0].id)
        setView("project")
      }
    } catch (err) {
      setError(formatError(err))
    }
  }

  const handleProjectUpdate = async (update) => {
    if (!selectedProject) return
    const updated = await updateProject(selectedProject.id, {
      name: selectedProject.name,
      description: selectedProject.description,
      ...update,
    })
    setProjects((prev) =>
      prev.map((project) =>
        project.id === updated.id ? { ...project, ...updated } : project
      )
    )
  }

  const handleToggleArchive = async () => {
    if (!selectedProject) return
    try {
      const updated = selectedProject.archived
        ? await unarchiveProject(selectedProject.id)
        : await archiveProject(selectedProject.id)
      setProjects((prev) =>
        prev.map((project) =>
          project.id === updated.id ? { ...project, ...updated } : project
        )
      )
    } catch (err) {
      setError(formatError(err))
    }
  }

  const handleEntryCreated = async (payload) => {
    if (!selectedProject) return

    try {
      const entry = await createEntry(selectedProject.id, payload)
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProject.id
            ? { ...project, entries: [entry, ...(project.entries || [])] }
            : project
        )
      )
    } catch (err) {
      // US-2.16: losing the connection must not lose what was typed. Any
      // other failure — a validation error, an archived project — is the
      // user's to see and fix, so it is re-thrown for the form to show.
      if (!err.offline) throw err

      try {
        await offlineQueue.enqueue({
          userId,
          projectId: selectedProject.id,
          data: payload.data,
          timeSpent: payload.time_spent ?? null,
          todo: payload.todo ?? false,
          dueDate: payload.due_date ?? null,
        })
      } catch {
        // Offline *and* unable to store locally. Re-throw the original
        // failure rather than claiming the entry was saved — telling someone
        // their work is safe when it is not is the worst outcome here.
        throw err
      }

      setOfflineNotice(
        "No connection — saved on this device and queued to sync."
      )
      await refreshQueued()
    }
  }

  const loadEntries = useCallback(async () => {
    if (!selectedId) return
    try {
      const entries = await fetchEntries(selectedId)
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedId ? { ...project, entries } : project
        )
      )
    } catch (err) {
      setError(formatError(err))
    }
  }, [selectedId])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  /** US-2.6/2.7: what a schema edit would do, asked before it is done. */
  const handleSchemaPreview = async (entrySchema) => {
    if (!selectedProject) return null
    return previewSchemaChange(selectedProject.id, entrySchema)
  }

  /**
   * Save an edited schema and take the migrated entries back from the server.
   *
   * Declared after loadEntries because it needs it. The entries are refetched
   * rather than patched in place: a schema change can rewrite, backfill or
   * retire a value on every one of them, so the copy held here is stale in ways
   * too varied to reconstruct locally.
   */
  const handleSchemaSave = async (entrySchema) => {
    if (!selectedProject) return null
    const result = await updateSchema(selectedProject.id, entrySchema)
    setProjects((prev) =>
      prev.map((project) =>
        project.id === result.project.id ? { ...project, ...result.project } : project
      )
    )
    await loadEntries()
    return result
  }

  // An import can add projects and entries wholesale, so reload both.
  // Projects first, then entries: GET /projects omits entries, so the other
  // order would wipe the list it had just fetched.
  useEffect(() => {
    const reload = async () => {
      await loadProjects()
      await loadEntries()
    }

    window.addEventListener("chronicles-imported", reload)
    return () => window.removeEventListener("chronicles-imported", reload)
  }, [loadProjects, loadEntries])

  // Drain anything captured offline: on load, when the browser reconnects,
  // and periodically in case that event never arrives.
  //
  // Declared after loadEntries because it needs it: loadProjects fetches
  // /projects, which does not include each project's entries. Reloading
  // projects alone therefore replaces the open project with a copy that has
  // no entries, emptying the list — the entries have to be fetched again
  // straight after, and in that order, or the projects response overwrites
  // them.
  useEffect(() => {
    if (!userId) return undefined

    const stop = syncEngine.start(userId)

    const unsubscribe = syncEngine.subscribe(async (state) => {
      // Keep the unsynced entries shown in the list in step with the queue.
      refreshQueued()

      // Reload from the server only on the transition from "work queued" to
      // "queue empty", rather than after every periodic drain, which is
      // usually a no-op.
      if (pendingBefore.current > 0 && state.pending === 0) {
        pendingBefore.current = state.pending
        await loadProjects()
        await loadEntries()
        setOfflineNotice(null)
        return
      }

      pendingBefore.current = state.pending
    })

    return () => {
      stop()
      unsubscribe()
    }
  }, [userId, loadProjects, loadEntries, refreshQueued])

  return (
    <div className="app-shell">
      <div className="app-bg-dynamic" aria-hidden="true">
        <div className="app-bg-sky" />
        <div className="app-bg-waves">
          <svg className="wave wave-back" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-mid" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,256L48,245.3C96,235,192,213,288,202.7C384,192,480,192,576,208C672,224,768,256,864,261.3C960,267,1056,245,1152,229.3C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-silhouettes" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <g className="silhouette-scene">
              <g transform="translate(208, 130)">
                <circle cx="46" cy="32" r="14" />
                <path d="M34 50c-10 20-12 48-4 69h36c8-21 5-49-5-69z" />
                <path d="M40 119l-10 53h14l13-50 13 50h14l-12-53z" />
                <rect x="77" y="89" width="72" height="7" rx="3" />
                <rect x="91" y="95" width="7" height="78" rx="3" />
                <path d="M60 68l28 20 7-9-27-27z" />
                <rect x="85" y="57" width="37" height="26" rx="3" transform="rotate(10 103 70)" />
              </g>
              <g transform="translate(535, 130)">
                <circle cx="45" cy="31" r="14" />
                <path d="M34 50c-8 24-4 49 8 66h15c12-17 16-42 7-66z" />
                <path d="M42 115l-13 57h16l12-49 12 49h16l-14-57z" />
                <path className="silhouette-detail" d="M37 65L9 88m57-22l30 19" />
                <circle cx="7" cy="89" r="5" />
              </g>
              <g transform="translate(825, 164)">
                <circle cx="49" cy="29" r="13" />
                <path d="M41 46l29 20-14 28-30-16z" />
                <path className="silhouette-detail" d="M38 59L5 55m50 38L35 134m14-40l39 28" />
                <circle cx="108" cy="136" r="26" className="silhouette-detail" />
                <circle cx="108" cy="136" r="5" />
              </g>
              <g transform="translate(1125, 128)">
                <circle cx="44" cy="31" r="14" />
                <path d="M32 50c-7 23-3 50 8 67h16c10-17 14-44 7-67z" />
                <path d="M40 116l-14 56h16l12-48 13 48h16l-15-56z" />
                <path className="silhouette-detail" d="M36 64L11 32m53 32l27-33" />
                <circle cx="8" cy="29" r="5" /><circle cx="94" cy="28" r="5" />
              </g>
            </g>
          </svg>
          <svg className="wave wave-front" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,288L48,282.7C96,277,192,267,288,245.3C384,224,480,192,576,197.3C672,203,768,245,864,261.3C960,277,1056,267,1152,250.7C1248,235,1344,213,1392,202.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>
        <div className="app-bg-grid" />
      </div>
      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-pill-left">
            <LogoIcon size={30} />
            <span className="brand-name">Chronicles</span>
          </div>
          <div className="nav-pill-center">
            <button
              type="button"
              className={`nav-item ${currentView === "home" ? "active" : ""}`}
              onClick={() => { setCurrentView("home"); setSelectedId(null); setView("project") }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "today" ? "active" : ""}`}
              onClick={() => setCurrentView("today")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <span>Today</span>
            </button>
            <button type="button" className={`nav-item ${currentView === "assistant" ? "active" : ""}`} onClick={() => setCurrentView("assistant")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3a7 7 0 0 0-7 7v3a4 4 0 0 0 4 4h1l2 3 2-3h1a4 4 0 0 0 4-4v-3a7 7 0 0 0-7-7Z" /><path d="M9 11h.01M15 11h.01" /></svg>
              <span>Mira</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "entries" ? "active" : ""}`}
              onClick={() => setCurrentView("entries")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>All Entries</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "tasks" ? "active" : ""}`}
              onClick={() => setCurrentView("tasks")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>All Tasks</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "board" ? "active" : ""}`}
              onClick={() => setCurrentView("board")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="4" width="5" height="16" rx="1" />
                <rect x="10" y="4" width="5" height="11" rx="1" />
                <rect x="17" y="4" width="4" height="7" rx="1" />
              </svg>
              <span>Board</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "outstanding" ? "active" : ""}`}
              onClick={() => setCurrentView("outstanding")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 2" />
                <path d="M4 4l2.5 2.5" />
              </svg>
              <span>Outstanding</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "calendar" ? "active" : ""}`}
              onClick={() => setCurrentView("calendar")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Calendar</span>
            </button>
          </div>
          <div className="nav-pill-right">
            <OfflineStatus userId={userId} projects={projects} />
            <AuthActions />
          </div>
        </nav>
      </header>
      <main className={`app-main ${currentView === "home" ? "home-main" : "app-main-wide"}`}>
        {error && (
          <div className="global-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {offlineNotice && (
          <div className="global-notice" role="status">
            <p>{offlineNotice}</p>
            <button type="button" onClick={() => setOfflineNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
        {currentView === "home" && <div className="sidebar-stack">
          <ProjectList
            projects={projects}
            statistics={statistics}
            selectedId={selectedId}
            onSelect={handleSelectProject}
            onCreate={() => setIsModalOpen(true)}
            onShowHome={() => { setSelectedId(null); setView("project") }}
            homeActive={view !== "timeline" && !selectedProject}
            onShowTimeline={handleShowTimeline}
            timelineActive={view === "timeline"}
          />
        </div>}
        <div className="content">
          {loading ? (
            <p className="hint">Loading…</p>
          ) : currentView === "calendar" ? (
            <CalendarView projects={projects} />
          ) : currentView === "today" ? (
            <TodayPage projects={projects} onNavigate={setCurrentView} onCreateProject={() => setIsModalOpen(true)} />
          ) : currentView === "assistant" ? (
            <MiraAssistantPage conversation={miraConversation} />
          ) : currentView === "tasks" ? (
            <TasksPage projects={projects} onCreate={() => setIsModalOpen(true)} />
          ) : currentView === "entries" ? (
            <EntriesPage projects={projects} onCreate={() => setIsModalOpen(true)} />
          ) : currentView === "board" ? (
            <BoardView projects={projects} />
          ) : currentView === "outstanding" ? (
            <OutstandingPage projects={projects} onNavigate={setCurrentView} />
          ) : view === "timeline" ? (
            <Timeline projects={projects} onOpenProject={handleSelectProject} />
          ) : selectedProject ? (
            <ProjectDetail
              key={selectedProject.id}
              project={openProject}
              projects={projects}
              onSchemaPreview={handleSchemaPreview}
              onSchemaSaved={handleSchemaSave}
              onEntryCreated={handleEntryCreated}
              onEditProject={() => setIsEditModalOpen(true)}
              onToggleArchive={handleToggleArchive}
              onOpenProject={handleSelectProject}
            />
          ) : projects.length > 0 ? (
            <HomeWorkspace projects={projects} onCreateProject={() => setIsModalOpen(true)} onToday={() => setCurrentView("today")} onNavigate={setCurrentView} onOpenProject={handleSelectProject} />
          ) : (
            <EmptyState onCreate={() => setIsModalOpen(true)} onSeedDemoData={handleSeedDemoData} />
          )}
        </div>
      </main>
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />
      <EditProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        project={selectedProject}
        onSave={handleProjectUpdate}
      />
      <CommandPalette projects={projects} onNavigate={setCurrentView} onCreateProject={() => setIsModalOpen(true)} />
      {currentView !== "assistant" && <MiraLauncher conversation={miraConversation} open={miraOpen} onToggle={() => setMiraOpen(value => !value)} onOpenFull={() => { setMiraOpen(false); setCurrentView("assistant") }} />}
    </div>
  )
}

export default App