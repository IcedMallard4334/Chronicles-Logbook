import { useNavigate } from "react-router-dom"
import { sendAIMessage, signOut } from "./api"
import { EntriesPage, TasksPage } from "./WorkspacePages"
import {
  EntryDetailModal,
  EntryFieldInput,
  InfoTip,
  LinkChip,
  RetiredValues,
  deriveProjectStatus,
  entryPreview,
  formatEntryValue,
  useProjectStatuses,
} from "./EntryShared"
import HomeWorkspace from "./HomeWorkspace"
import TodayPage from "./TodayPage"
import CommandPalette, { OPEN_COMMAND_PALETTE } from "./CommandPalette"
import CalendarView from "./CalendarView"
import BoardView from "./BoardView"
import OutstandingPage from "./OutstandingPage"
import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"
import LogoIcon from "./ChroniclesLogo"
import { TaskPanel } from "./TaskPanel"
import OfflineStatus from "./OfflineStatus"
import Invitations from "./Invitations"
import AmbientBackground from "./AmbientBackground"
import ViewTransition, { ViewLoader } from "./ViewTransition"
import { useDialogFocus } from "./useDialogFocus"
import { PageHint, WelcomeTour } from "./GuidedTour"
import { PAGE_TOURS, PROJECT_TOURS, WELCOME_TOUR, seenTours } from "./tourSteps"
import DataTransfer from "./DataTransfer"
import { REJECTED, offlineQueue } from "./offlineQueue"
import { syncEngine } from "./offlineSync"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  archiveProject,
  createEntry,
  createProject,
  deleteAccount,
  deleteProject,
  fetchEntries,
  fetchFieldTimeline,
  fetchProjectMembers,
  fetchProjects,
  fetchStatistics,
  fetchTasks,
  leaveProject,
  previewSchemaChange,
  shareProject,
  unarchiveProject,
  unshareProject,
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
  CHECKLIST_LIMIT,
  FIELD_TYPE_META,
  FIELD_TYPES,
  TAGS_LIMIT,
  describeExpression,
  expressionCanonical,
  expressionError,
  expressionToDisplay,
  fieldTypeLabel,
  humaniseValue,
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

// Signing out and deleting the account deliberately live only on the profile
// page. Having them here as well meant two routes to an irreversible action,
// one of them a single click away from a menu opened for something else.
function UserMenu({ userName, avatarUrl, initials }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

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
      {/* The avatar is the trigger: one control in the corner rather than a
          face and a set of lines sitting beside each other doing similar
          things. Profile itself is the first item in the menu. */}
      <button
        type="button"
        className="user-menu-trigger user-avatar"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${userName} — account menu`}
        title={userName}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          initials
        )}
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
            onClick={() => { window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE)); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Search</span>
            <kbd className="user-dropdown-kbd">Ctrl K</kbd>
          </button>
          <div className="user-dropdown-divider" />
          <DataTransfer onClose={() => setOpen(false)} />
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item user-dropdown-profile"
            role="menuitem"
            onClick={() => { navigate("/profile"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </button>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => { navigate("/help"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Help</span>
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
  const deleteDialogRef = useDialogFocus(showDeleteModal, () => closeDeleteModal())

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
        {/* Google already gives us a photo and it was being thrown away.
            no-referrer matters: Google's CDN refuses the image otherwise. */}
        <UserMenu
          userName={user.full_name}
          avatarUrl={user.avatar_url}
          initials={initials}
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
            ref={deleteDialogRef}
            className="modal-card delete-account-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-description delete-account-warning"
            tabIndex={-1}
          >
            <LogoIcon className="modal-character" size={90} />

            <h2 id="delete-account-title">
              Delete your account?
            </h2>

            <p id="delete-account-description">
              This will permanently delete your Chronicles account
              and all of its projects, entries, and tasks.
            </p>

            <p id="delete-account-warning" className="delete-warning">
              This action cannot be undone.
            </p>

            <label className="field-label full">
              Type <strong>DELETE</strong> to confirm
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
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
            <h3>Custom schemas</h3>
            <span>Define your own fields per project</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Quick capture</h3>
            <span>Log entries in seconds</span>
          </div>
          <div className="empty-feature">
            <div className="empty-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <h3>Tasks & deadlines</h3>
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

  const handleCancel = () => {
    setName("")
    setDescription("")
    onClose()
  }

  const dialogRef = useDialogFocus(isOpen, handleCancel)

  if (!isOpen) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate({ name: trimmed, description: description.trim() || null })
    setName("")
    setDescription("")
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        tabIndex={-1}
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

  const handleCancel = () => {
    setError(null)
    onClose()
  }

  const dialogRef = useDialogFocus(isOpen, handleCancel)

  if (!isOpen) return null

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
        ref={dialogRef}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        tabIndex={-1}
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
        {/* The run being kept up, with the best run alongside so a broken streak
            still shows what was achieved rather than just a zero. */}
        <span
          className={totals && totals.current_streak > 0 ? "is-streak-alive" : ""}
          title={totals ? `Longest run: ${totals.longest_streak} day${totals.longest_streak === 1 ? "" : "s"}` : undefined}
        >
          <strong>{totals ? totals.current_streak : "–"}</strong> day streak
        </span>
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
        // Three different states, which all used to read as the middle one:
        // a link that was never pointed anywhere is not the same as one whose
        // target has since been deleted, and saying so sends the owner to the
        // wrong place to fix it.
        <p className="field-summary-detail">
          {!field.linked_project_id
            ? "Not pointed at a project yet — choose one in Edit schema."
            : target
              ? `Links to ${target.name}`
              : "Links to a project you no longer have"}
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

/**
 * Why the rich fields cannot be saved yet, or `null` if they can.
 *
 * The server applies the same rules and its word is final (US-2.1–US-2.3).
 * Checking here means the problem is explained beside the form it was made
 * in, rather than as a rejection after the entry has been sent. Only what
 * the payload holds is judged: a link left empty is no link, and a checklist
 * nobody touched is an empty list the server accepts.
 */
function richFieldProblem(schema, payload) {
  for (const field of schema) {
    const value = payload[field.id]
    if (field.type === "tags" && Array.isArray(value)) {
      if (value.length === 0) return `"${field.name}" needs at least one tag.`
      if (value.length > TAGS_LIMIT.count)
        return `"${field.name}" can hold up to ${TAGS_LIMIT.count} tags.`
      if (value.some((tag) => String(tag).trim().length > TAGS_LIMIT.length))
        return `Each tag in "${field.name}" can be at most ${TAGS_LIMIT.length} characters.`
    }
    if (field.type === "checklist" && Array.isArray(value)) {
      if (value.length > CHECKLIST_LIMIT.count)
        return `"${field.name}" can hold up to ${CHECKLIST_LIMIT.count} items.`
      const texts = value.map((item) => String(item?.text || "").trim())
      if (texts.some((text) => !text))
        return `Every item in "${field.name}" needs some text.`
      if (texts.some((text) => text.length > CHECKLIST_LIMIT.length))
        return `Each item in "${field.name}" can be at most ${CHECKLIST_LIMIT.length} characters.`
      const folded = texts.map((text) => text.toLowerCase())
      if (new Set(folded).size !== folded.length)
        return `Every item in "${field.name}" must be different.`
    }
  }
  return null
}

function EntryForm({ project, projects = [], entries = [], onCreated, onOpenProject }) {
  const schema = useMemo(() => project.entry_schema || [], [project.entry_schema])
  const [title, setTitle] = useState("")
  const [data, setData] = useState({})
  const [hoursSpent, setHoursSpent] = useState("")
  const [minutesSpent, setMinutesSpent] = useState("")
  const [todo, setTodo] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  // Recomputed as you type, so a calculation settles while the entry is being
  // filled in rather than only after it is saved.
  const computed = useMemo(() => withComputedValues(data, schema), [data, schema])

  // Every tag this project's entries already carry, offered as you type: a
  // filter only works when the same label is written the same way twice, and
  // the entries come from the parent's up-to-date list rather than a copy
  // taken when this form first mounted.
  const tagSuggestions = useMemo(() => {
    const tagFields = schema.filter((field) => field.type === "tags")
    if (tagFields.length === 0) return []
    const seen = new Set()
    for (const entry of entries) {
      for (const field of tagFields) {
        for (const tag of entry.data?.[field.id] || []) {
          if (typeof tag === "string" && tag.trim()) seen.add(tag)
        }
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [entries, schema])

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
    setTitle("")
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
      const problem = richFieldProblem(schema, payload)
      if (problem) {
        setError(problem)
        return
      }
      const hours = hoursSpent === "" ? 0 : Number(hoursSpent)
      const minutes = minutesSpent === "" ? 0 : Number(minutesSpent)
      const timeSpent = hours * 60 + minutes
      await onCreated({
        title: title.trim() || undefined,
        data: payload,
        time_spent: timeSpent === 0 ? null : timeSpent,
        todo,
        // Sent as null rather than "" so the server reads it as "no deadline"
        // instead of rejecting an empty date.
        due_date: dueDate || null,
      })
      setTitle("")
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
      <label className="field-label">
        Title (optional)
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Give this entry a name so it's easy to find later"
        />
      </label>
      <div className="form-grid">
        {schema.map((field) => (
          <EntryFieldInput
            key={field.id}
            field={field}
            value={data[field.id]}
            computed={computed[field.id]}
            projects={linkable}
            status={statuses[field.linked_project_id]}
            entries={entries}
            suggestions={tagSuggestions}
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
        <div className="checkbox-with-tip">
          <label className="field-label checkbox-label">
            <input
              type="checkbox"
              checked={todo}
              onChange={(e) => {
                setTodo(e.target.checked)
                if (!e.target.checked) setDueDate("")
              }}
            />
            This is still to do
          </label>
          <InfoTip text="Marks this as work you haven't finished yet, instead of a record of something already done. It'll show up on Outstanding and in Board's 'Still to do' column until you check it off." />
        </div>
        {todo && (
          <label className="field-label due-date-field">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        )}
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

/** The tags an entry carries, as the chips they were written as. */
function TagsValue({ value }) {
  const tags = Array.isArray(value) ? value : []
  if (tags.length === 0) return "—"
  return (
    <span className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip-small">
          {tag}
        </span>
      ))}
    </span>
  )
}

/**
 * How far along a checklist is: the count, with the items themselves on
 * hover — the number is what the row has room for, the list is what someone
 * checking progress actually wants (US-2.2).
 */
function ChecklistValue({ value }) {
  const items = Array.isArray(value) ? value : []
  if (items.length === 0) return "—"
  const done = items.filter((item) => item && item.completed).length
  return (
    <span
      className="checklist-preview"
      title={items
        .map((item) => `${item.completed ? "✓" : "○"} ${item.text}`)
        .join("\n")}
    >
      {done} of {items.length} done
    </span>
  )
}

/**
 * An entry link's target, named rather than shown as the id it is stored as.
 *
 * The target is looked up in the rows already on the page; a link whose
 * target cannot be found says so plainly instead of showing a bare UUID.
 */
function LinkValue({ value, entryById }) {
  if (!value) return "—"
  const target = entryById.get(value)
  return (
    <span
      className="link-badge"
      title={target ? "This entry links to that one" : "The entry it linked to is gone"}
    >
      ↳ {entryPreview(target)}
    </span>
  )
}

function EntryList({
  entries,
  schema,
  schemaVersion,
  retiredSchema = [],
  projects = [],
  project,
  userId,
  onOpenProject,
  onEntryUpdated,
  onEntryDeleted,
}) {
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  )

  // A link stores its target's id — right to store, unreadable to show — so
  // the rows index themselves by id and the cell resolves the name. The same
  // index answers the other direction: which entries point at this one
  // (US-2.3), worked out from the rows already on the page rather than by
  // asking the server once per row.
  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries]
  )
  const backlinksById = useMemo(() => {
    const linkFields = (schema || []).filter((field) => field.type === "link")
    const map = new Map()
    if (linkFields.length === 0) return map
    for (const entry of entries) {
      for (const field of linkFields) {
        const targetId = entry.data?.[field.id]
        if (!targetId) continue
        if (!map.has(targetId)) map.set(targetId, [])
        map.get(targetId).push(entry)
      }
    }
    return map
  }, [entries, schema])

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
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) || null

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
          // An entry keeps the exact shape it was recorded in until someone
          // individually migrates it — the *project's* current schema is
          // the wrong thing to render an old entry against, since it can
          // ask for a field this entry never had. Each row reads its own
          // schema_snapshot instead, falling back to the passed-down schema
          // only for a legacy entry written before snapshots existed.
          const rowSchema = entry.schema_snapshot?.length ? entry.schema_snapshot : schema
          // Recomputed rather than read back: an entry captured offline holds
          // no stored calculation until it syncs, and the current formula is
          // the honest answer either way. What the server stored agrees with
          // it, because every write re-derives against the entry's own shape.
          const data = withComputedValues(entry.data || {}, rowSchema)
          const isStale = entry.schema_version != null && schemaVersion != null && entry.schema_version < schemaVersion
          const backlinks = backlinksById.get(entry.id) || []
          return (
            <li
              key={entry.id}
              className={`log-row ${entry.pending ? "is-unsynced" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="Open entry detail"
              onClick={() => setSelectedEntryId(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setSelectedEntryId(entry.id)
                }
              }}
            >
              {entry.title && <p className="log-title">{entry.title}</p>}
              {isStale && (
                <p className="log-stale-note">
                  Recorded under an earlier version of this project&rsquo;s schema.
                </p>
              )}
              <div className="log-fields">
                {rowSchema.map((field) => {
                  const meta = FIELD_TYPE_META[field.type]
                  const value = data[field.id]
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
                        {field.type === "project_reference" && value ? (
                          // The chip opens a different project; the row it
                          // sits in opens this entry's detail. Without this,
                          // clicking the chip would fire both.
                          <span onClick={(event) => event.stopPropagation()}>
                            <LinkChip
                              targetId={value}
                              projects={projects}
                              status={statuses[value]}
                              onOpen={onOpenProject}
                            />
                          </span>
                        ) : field.type === "tags" ? (
                          <TagsValue value={value} />
                        ) : field.type === "checklist" ? (
                          <ChecklistValue value={value} />
                        ) : field.type === "link" ? (
                          <LinkValue value={value} entryById={entryById} />
                        ) : (
                          formatEntryValue(field, value, projectNames)
                        )}
                        {/* Marked so a derived figure is never mistaken for one
                            that was typed in — for sighted and screen reader
                            users alike, not just visually. */}
                        {field.type === "computed" && (
                          <span
                            className="calculated-badge"
                            role="img"
                            aria-label="Calculated from the other fields on this entry"
                            title="Calculated from the other fields on this entry"
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
                {/* Only named when known: entries written before a project
                    could be shared have no author, and an empty "logged by"
                    reads worse than none at all. */}
                {entry.created_by_name && (
                  <span className="entry-author"> · {entry.created_by_name}</span>
                )}
              </span>
              {/* Which entries point at this one (US-2.3), worked out from
                  the rows already on the page: one pass, no extra requests. */}
              {backlinks.length > 0 && (
                <p className="entry-backlinks">
                  <span className="entry-backlinks-label">Linked from</span>
                  {backlinks.map((source) => (
                    <span key={source.id} className="entry-backlink">
                      {entryPreview(source)}
                    </span>
                  ))}
                </p>
              )}
              {/* Last, and collapsed: history worth keeping is not history worth
                  leading with. Stops the click so expanding it doesn't also
                  open the row's own detail view. */}
              <span onClick={(event) => event.stopPropagation()}>
                <RetiredValues
                  retiredData={entry.retired_data || {}}
                  retiredSchema={retiredSchema}
                />
              </span>
            </li>
          )
        })}
      </ul>
      {selectedEntry && project && (
        <EntryDetailModal
          project={project}
          entry={selectedEntry}
          projects={projects}
          entries={entries}
          canManage={!project.shared || (Boolean(userId) && selectedEntry.created_by === userId)}
          onClose={() => setSelectedEntryId(null)}
          onSaved={(saved) => {
            onEntryUpdated?.(saved)
            setSelectedEntryId(null)
          }}
          onDeleted={(id) => {
            onEntryDeleted?.(id)
            setSelectedEntryId(null)
          }}
        />
      )}
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
          className="btn-primary timeline-submit"
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
              {isNumericField({ type: timeline.field_type }) ? (
                <div className="timeline-chart" aria-label={`${timeline.field_name} over time`}>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart
                      data={timeline.points.map((point) => ({
                        ...point,
                        date: new Date(point.created_at).toLocaleDateString(),
                        numericValue: Number(point.value),
                      }))}
                    margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                  >
                    {/* Recharts' own defaults are hardcoded greys/blues that
                        don't follow the app's theme or chosen accent — every
                        colour here is read from the same custom properties
                        the rest of the page uses, so the chart matches
                        whichever theme and accent are active, light or dark. */}
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis stroke="var(--line)" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                      }}
                      labelStyle={{ color: "var(--muted)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="numericValue"
                      name={timeline.field_name}
                      stroke="var(--blue)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--blue)" }}
                      activeDot={{ r: 6, fill: "var(--blue)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              ) : (
                // A line chart needs a number to plot on its Y-axis — a
                // text/date/choice/etc. value has nowhere honest to go on
                // one, which is what used to render as an empty, confusing
                // box. The table below already shows every value in order,
                // so that's the real answer for a field like this.
                <p className="hint timeline-not-chartable">
                  {fieldTypeLabel(timeline.field_type)} fields aren&rsquo;t shown as a
                  line chart — there&rsquo;s no number to plot. Every value is listed
                  in order below instead.
                </p>
              )}

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
  userId,
  onSchemaPreview,
  onSchemaSaved,
  onEntryCreated,
  onEntryUpdated,
  onEntryDeleted,
  onEditProject,
  onToggleArchive,
  onDeleteProject,
  onOpenProject,
  onLeaveProject,
  hintsSuppressed = false,
}) {
  const [tab, setTab] = useState("entries")
  const [leaving, setLeaving] = useState(false)
  const [, setProjectHintTick] = useState(0)

  useEffect(() => {
    setTab("entries")
  }, [project.id])

  // US-3.23: the same "first time you open this" coach mark as the page
  // tours, scoped to a project's own tabs instead of the app's top-level
  // views — schema, entries and tasks each get explained once, the moment
  // somebody actually looks at that tab. Suppressed while the welcome tour
  // or the current page's own hint is still on screen — PageHint has no
  // scrim by design (it shouldn't block whatever you were doing), which
  // means opening a project before dismissing the page-level hint is a
  // perfectly normal thing to do, and would otherwise stack a second
  // unrelated hint on top of it.
  const projectTour = hintsSuppressed ? null : PROJECT_TOURS[tab]
  const showProjectHint = projectTour && !seenTours().includes(projectTour.id)

  const handleLeave = async () => {
    if (!window.confirm(`Leave "${project.name}"? Entries you wrote stay in it.`)) return
    setLeaving(true)
    try {
      await onLeaveProject?.()
    } finally {
      setLeaving(false)
    }
  }

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
              <EntryForm project={project} projects={projects} entries={project.entries || []} onCreated={onEntryCreated} onOpenProject={onOpenProject} />
            )}
            <EntryList
              entries={project.entries || []}
              schema={project.entry_schema || []}
              schemaVersion={project.schema_version}
              retiredSchema={project.retired_schema || []}
              projects={projects}
              project={project}
              userId={userId}
              onOpenProject={onOpenProject}
              onEntryUpdated={onEntryUpdated}
              onEntryDeleted={onEntryDeleted}
            />
          </>
        ) : tab === "schema" ? (
          <SchemaBuilder
            project={project}
            projects={projects}
            onPreview={onSchemaPreview}
            onSave={onSchemaSaved}
            disabled={project.archived || project.shared}
            onSwitchToEntries={() => setTab("entries")}
          />
        ) : (
          <TaskPanel projectId={project.id} />
        )}
      </div>
      <footer className="detail-footer">
        {project.shared ? (
          <div className="detail-shared-note">
            <p>
              Shared with you. You can add entries and correct your own; changing
              the project's fields, archiving and exporting stay with its owner.
            </p>
            <button
              type="button"
              className="btn-secondary detail-leave-btn"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? "Leaving…" : "Leave project"}
            </button>
          </div>
        ) : (
          <>
            <ShareProjectPanel projectId={project.id} />
            <div className="detail-footer-actions">
              <button
                type="button"
                className="btn-secondary detail-archive-btn"
                onClick={onToggleArchive}
              >
                {project.archived ? "Unarchive project" : "Archive project"}
              </button>
              <DeleteProjectControl project={project} onDeleted={onDeleteProject} />
            </div>
          </>
        )}
      </footer>
      {showProjectHint && (
        <PageHint
          hint={projectTour}
          onDismiss={() => setProjectHintTick((tick) => tick + 1)}
        />
      )}
    </section>
  )
}

// Archiving is the ordinary way to finish with a project and it keeps the
// record, so deletion is deliberately the harder of the two: it asks for the
// project's name back, the way the account deletion does, rather than putting
// an irreversible action behind a single click.
function DeleteProjectControl({ project, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")

  const matches = typed.trim() === project.name

  const confirm = async () => {
    if (!matches) return
    setIsDeleting(true)
    setError("")
    try {
      await deleteProject(project.id)
      onDeleted(project.id)
    } catch (err) {
      setError(formatError(err))
      setIsDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-danger detail-delete-btn"
        onClick={() => {
          setConfirming(true)
          setTyped("")
          setError("")
        }}
      >
        Delete project
      </button>
    )
  }

  return (
    <div className="delete-project-confirm">
      <p className="delete-project-warning">
        This removes <strong>{project.name}</strong> and every entry and task in it,
        for good. Archiving it keeps the record instead.
      </p>
      <label className="field-label">
        Type the project&rsquo;s name to confirm
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={project.name}
          autoFocus
        />
      </label>
      <div className="delete-project-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setConfirming(false)}
          disabled={isDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={confirm}
          disabled={!matches || isDeleting}
        >
          {isDeleting ? "Deleting…" : "Delete for good"}
        </button>
      </div>
      {error && (
        <p className="share-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ShareProjectPanel({ projectId }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState("")
  const [isSharing, setIsSharing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    fetchProjectMembers(projectId)
      .then((list) => {
        if (active) setMembers(list)
      })
      .catch(() => {
        if (active) setMembers([])
      })
    return () => {
      active = false
    }
  }, [projectId])

  const invite = async (event) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return

    setIsSharing(true)
    setError("")
    setNotice("")
    try {
      const member = await shareProject(projectId, address)
      // Sharing is idempotent on the server, so re-inviting someone returns
      // their existing invitation rather than failing — don't list them twice.
      setMembers((current) =>
        current.some((person) => person.user_id === member.user_id)
          ? current.map((person) => (person.user_id === member.user_id ? member : person))
          : [...current, member]
      )
      setEmail("")
      setNotice(`${member.full_name} has been invited. Nothing changes until they accept.`)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSharing(false)
    }
  }

  const revoke = async (member) => {
    setError("")
    setNotice("")
    try {
      await unshareProject(projectId, member.user_id)
      setMembers((current) =>
        current.filter((person) => person.user_id !== member.user_id)
      )
    } catch (err) {
      setError(formatError(err))
    }
  }

  return (
    <div className="share-panel">
      <h3 className="share-title">Shared with</h3>
      <p className="share-hint">
        People you invite can read this project and write entries in it once
        they accept — nothing changes for them until they do. Only you can
        change its fields, archive it or export it.
      </p>

      {members.length === 0 ? (
        <p className="share-empty">Not shared with anyone yet.</p>
      ) : (
        <ul className="share-members">
          {members.map((member) => (
            <li key={member.user_id} className="share-member">
              <span className="share-member-name">{member.full_name}</span>
              <span className="share-member-email">{member.email}</span>
              {member.status !== "accepted" && (
                <span className={`status-badge share-status-${member.status}`}>
                  {member.status === "pending" ? "Invited" : "Declined"}
                </span>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => revoke(member)}
              >
                {member.status === "pending" ? "Cancel invite" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="share-form" onSubmit={invite}>
        <label className="field-label">
          Invite by email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="them@example.com"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={isSharing || !email.trim()}>
          {isSharing ? "Sharing…" : "Share"}
        </button>
      </form>

      {error && (
        <p className="share-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="share-notice" role="status">
          {notice}
        </p>
      )}
    </div>
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

  // US-3.23: a one-time welcome tour, then a single coach mark the first
  // time each page is opened. Both read seenTours() fresh on every render
  // rather than caching "have I shown this" in state — the tick counters
  // below exist only to force that re-read once a tour marks itself seen,
  // since the dismissal itself lives in localStorage, not component state.
  const [, setWelcomeTick] = useState(0)
  const [, setHintTick] = useState(0)
  const showWelcome = !loading && !seenTours().includes(WELCOME_TOUR.id)
  const pageKey = view === "timeline" ? "timeline" : currentView
  const pageTour = PAGE_TOURS[pageKey]
  const showPageHint =
    !loading && !showWelcome && pageTour && !seenTours().includes(pageTour.id)

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

  const handleDeleteProject = (deletedId) => {
    setProjects((prev) => prev.filter((project) => project.id !== deletedId))
    // What was on screen no longer exists, so fall back to the timeline rather
    // than leaving the detail panel pointed at a project that is gone.
    setSelectedId(null)
    setView("timeline")
  }

  const handleLeaveProject = async () => {
    if (!selectedProject) return
    try {
      await leaveProject(selectedProject.id)
      // The entries you wrote stay in the project's record; leaving only ends
      // your access, so this only has to drop it from your own workspace.
      setProjects((prev) => prev.filter((project) => project.id !== selectedProject.id))
      setSelectedId(null)
      setView("timeline")
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

  const handleEntryUpdated = (updated) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === updated.project_id
          ? {
              ...project,
              entries: (project.entries || []).map((entry) =>
                entry.id === updated.id ? updated : entry
              ),
            }
          : project
      )
    )
  }

  const handleEntryDeleted = (entryId) => {
    setProjects((prev) =>
      prev.map((project) =>
        (project.entries || []).some((entry) => entry.id === entryId)
          ? { ...project, entries: project.entries.filter((entry) => entry.id !== entryId) }
          : project
      )
    )
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
      <AmbientBackground />
      <div className="app-bg-dynamic" aria-hidden="true">
        <div className="app-bg-sky" />
        <div className="app-bg-waves">
          <svg className="wave wave-back" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-mid" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,256L48,245.3C96,235,192,213,288,202.7C384,192,480,192,576,208C672,224,768,256,864,261.3C960,267,1056,245,1152,229.3C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-front" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,288L48,282.7C96,277,192,267,288,245.3C384,224,480,192,576,197.3C672,203,768,245,864,261.3C960,277,1056,267,1152,250.7C1248,235,1344,213,1392,202.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>
        <div className="app-bg-grid" />
      </div>
      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-flow" aria-hidden="true"><svg viewBox="0 0 1400 70" preserveAspectRatio="none"><path d="M-100 55 C180 -20 330 100 600 35 S1000 0 1500 45" /><path d="M-100 15 C250 90 420 -25 740 40 S1100 80 1500 10" /><path d="M-100 60 C350 20 500 80 900 15 S1200 65 1500 35" /></svg></div>
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
            <Invitations onChanged={loadProjects} />
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
          {/* Keyed on the tab, the timeline toggle, the open project and the
              loading flag, so switching any of those animates — including
              the moment a fetch finishes and real content replaces the
              loader, which now fades/slides in rather than popping in. */}
          <ViewTransition viewKey={`${currentView}:${view}:${selectedId || "none"}:${loading ? "loading" : "ready"}`}>
            {loading ? (
              <ViewLoader label="Opening your logbook…" delay={0} />
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
                userId={userId}
                onSchemaPreview={handleSchemaPreview}
                onSchemaSaved={handleSchemaSave}
                onEntryCreated={handleEntryCreated}
                onEntryUpdated={handleEntryUpdated}
                onEntryDeleted={handleEntryDeleted}
                onEditProject={() => setIsEditModalOpen(true)}
                onToggleArchive={handleToggleArchive}
                onDeleteProject={handleDeleteProject}
                onOpenProject={handleSelectProject}
                onLeaveProject={handleLeaveProject}
                hintsSuppressed={showWelcome || showPageHint}
              />
            ) : projects.length > 0 ? (
              <HomeWorkspace projects={projects} onCreateProject={() => setIsModalOpen(true)} onToday={() => setCurrentView("today")} onNavigate={setCurrentView} onOpenProject={handleSelectProject} />
            ) : (
              <EmptyState onCreate={() => setIsModalOpen(true)} onSeedDemoData={handleSeedDemoData} />
            )}
          </ViewTransition>
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
      <CommandPalette projects={projects} onNavigate={setCurrentView} onOpenProject={handleSelectProject} onCreateProject={() => setIsModalOpen(true)} />
      {showWelcome && (
        <WelcomeTour tour={WELCOME_TOUR} onFinish={() => setWelcomeTick((tick) => tick + 1)} />
      )}
      {showPageHint && (
        <PageHint hint={pageTour} onDismiss={() => setHintTick((tick) => tick + 1)} />
      )}
      {currentView !== "assistant" && <MiraLauncher conversation={miraConversation} open={miraOpen} onToggle={() => setMiraOpen(value => !value)} onOpenFull={() => { setMiraOpen(false); setCurrentView("assistant") }} />}
    </div>
  )
}

export default App
