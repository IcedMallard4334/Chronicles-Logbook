import { sendAIMessage, signOut } from "./api"
import { EntriesPage, TasksPage } from "./WorkspacePages"
import HomeWorkspace from "./HomeWorkspace"
import TodayPage from "./TodayPage"
import TimelinePage, { projectHue } from "./TimelinePage"
import AmbientBackground from "./AmbientBackground"
import EntryEditor from "./EntryEditor"
import Invitations from "./Invitations"
import ViewTransition, { SkeletonRows, ViewLoader } from "./ViewTransition"
import { PageHint, WelcomeTour } from "./GuidedTour"
import { PAGE_TOURS, PROJECT_TOURS, WELCOME_TOUR, seenTours } from "./tourSteps"
import {
  NOT_RECORDED,
  ValueView,
  cellFor,
  columnsFor,
  entrySummary,
  sameFormat,
  schemaForEntry,
} from "./entryValues"
import CommandPalette, { OPEN_COMMAND_PALETTE } from "./CommandPalette"
import CalendarView from "./CalendarView"
import BoardView from "./BoardView"
import OutstandingPage from "./OutstandingPage"
import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"
import LogoIcon from "./ChroniclesLogo"
import FieldTypePicker from "./FieldTypePicker"
import QuickCapture, { OPEN_QUICK_CAPTURE } from "./QuickCapture"
import { ChecklistInput, LinkInput, TagsInput } from "./EntryFields"
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
  deleteProject,
  fetchActivity,
  fetchEntries,
  fetchFieldStatistics,
  fetchFieldTimeline,
  fetchProjectMembers,
  fetchProjects,
  fetchStatistics,
  fetchStatisticsCsv,
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
  Area,
  AreaChart,
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
import "./entryValues.css"
import "./StatisticsPage.css"

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
            onClick={() => { window.location.assign("/profile"); setOpen(false) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
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

function ProjectList({ projects, statistics, selectedId, onSelect, onCreate, onShowHome, homeActive, onShowTimeline, onShowStatistics }) {
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
        {/* Two destinations, because they answer two questions. "What did I
            do?" is the record and lives in Timeline; "what does it add up to?"
            is the numbers and lives in Statistics. One tab called Activity was
            doing both badly, which is why nobody could tell what it was for. */}
        <button type="button" onClick={onShowTimeline}>
          <span aria-hidden="true">◷</span> Timeline
        </button>
        <button type="button" onClick={onShowStatistics}>
          <span aria-hidden="true">░</span> Statistics
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

/**
 * How many past entries a reader will see differently, or an empty string when
 * a change costs nothing at all.
 *
 * Deliberately never says "rewritten" or "updated", because nothing is: the
 * entries keep their values and keep the format they were written under. What
 * changes is only how they line up against the new format.
 */
function impactSentence(change) {
  if (change.kind === "added" && change.entries_affected > 0) {
    return `${change.entries_affected} earlier ${plural(
      change.entries_affected,
      "entry has",
      "entries have"
    )} nothing to show here`
  }
  if (change.values_retired > 0) {
    return `${change.values_retired} ${plural(
      change.values_retired,
      "entry keeps what it",
      "entries keep what they"
    )} recorded, under the old format`
  }
  if (change.entries_affected > 0) {
    return `${change.entries_affected} earlier ${plural(
      change.entries_affected,
      "entry is",
      "entries are"
    )} unaffected and stay as written`
  }
  return ""
}

/**
 * What an edit means for entries already recorded, shown before it is saved.
 *
 * Changing a schema used to be the one action in the logbook that could alter
 * data the user did not type — backfilling new fields, coercing old values,
 * replacing what it could not read with a default. It no longer does any of
 * that, and this screen exists to say so plainly, because "are my old entries
 * safe?" is the question anybody sensible asks before pressing the button.
 *
 * The report comes from the server, which produces it by examining the real
 * entries — so this is what will happen, not an estimate of it.
 */
function SchemaChangeReview({ preview, onApply, onKeepEditing, isSaving }) {
  const hasWarnings = preview.changes.some((change) => change.severity === "warning")

  return (
    <div className="schema-review" role="region" aria-label="Review schema changes">
      <div className="panel-head">
        <h4>Review these changes</h4>
        <p>
          Entries written from now on use the new format.{" "}
          {preview.entry_count > 0 ? (
            <>
              The {preview.entry_count}{" "}
              {plural(preview.entry_count, "entry", "entries")} already recorded stay
              exactly as written.
            </>
          ) : (
            <>There is nothing recorded yet, so nothing to carry over.</>
          )}
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
          Nothing is deleted and nothing is rewritten. Values the new format would
          not ask for stay on the entries that recorded them, shown as they were
          written and marked <strong>earlier format</strong>. Restore the field and
          they line up again.
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
        {/* A grid of explained cards rather than a dropdown of nine words.
            "Tags", "Choice" and "Checklist" all sound like "a list of things"
            in a select, which is how people ended up picking one and
            concluding the field types were broken. */}
        <FieldTypePicker
          value={field.type}
          disabledTypes={{
            // Offered but greyed with the reason, so "where is the calculation
            // option?" has an answer on screen rather than nowhere.
            computed:
              sources.length === 0
                ? "Needs a number field to read from — add one first."
                : null,
            project_reference:
              linkable.length === 0
                ? "Needs somewhere to point — create another project first."
                : null,
          }}
          onChoose={(type) =>
            onChange(index, {
              type,
              options: type === "dropdown" ? field.options || [""] : field.options,
              expression: type === "computed" ? field.expression || "" : field.expression,
            })
          }
        />
      </div>
      {field.type === "dropdown" && (
        <>
          <label className="field-label full">
            The options to choose from
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
              placeholder="Draft, In review, Done"
            />
          </label>
          <p className="field-type-hint">
            Separate them with commas. Each entry picks exactly one. If you want
            several at once, or you would rather make them up as you go, use{" "}
            <strong>Tags</strong> instead.
          </p>
          {(field.options || []).length > 0 && (
            <p className="field-option-preview">
              An entry will choose from:{" "}
              {(field.options || []).map((option) => (
                <span key={option} className="value-tag">
                  {option}
                </span>
              ))}
            </p>
          )}
        </>
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
            ? "Changes apply to entries you write from now on. Everything already recorded stays exactly as you wrote it."
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
 * One field on the new-entry form.
 *
 * A calculation is shown rather than asked for (US-2.5): it is worked out from
 * the figures beside it, so an input would invite someone to type a value the
 * server would immediately overwrite.
 */
function EntryFieldInput({ field, value, computed, projects, status, entries = [], onOpenProject, onChange }) {
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
          <output className="computed-value is-link is-unset">
            Not pointed at a project yet
          </output>
        )}
      </div>
    )
  }

  // Tags and checklists hold a list, not a string, and each renders several
  // controls — so they get a div rather than a label, which would bind every
  // click to whichever control happened to come first.
  //
  // Each also carries the registry's one-line "how you fill this in". Three of
  // the richer types look like a text box until you try to use one, and the
  // sentence costs a line.
  if (field.type === "tags") {
    return (
      <div className="field-label">
        <span className="field-label-text">{field.name}</span>
        <TagsInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
        <span className="field-capture-hint">{FIELD_TYPE_META.tags.capture}</span>
      </div>
    )
  }

  if (field.type === "checklist") {
    return (
      <div className="field-label">
        <span className="field-label-text">{field.name}</span>
        <ChecklistInput
          value={Array.isArray(value) ? value : []}
          onChange={(next) => onChange(field.id, next)}
        />
        <span className="field-capture-hint">{FIELD_TYPE_META.checklist.capture}</span>
      </div>
    )
  }

  if (field.type === "link") {
    return (
      <label className="field-label">
        {field.name}
        <LinkInput
          value={value || ""}
          onChange={(next) => onChange(field.id, next)}
          entries={entries}
        />
        {entries.length > 0 && (
          <span className="field-capture-hint">{FIELD_TYPE_META.link.capture}</span>
        )}
      </label>
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

  // The entries a link field can point at. Read from the project rather than
  // fetched separately: `App` already keeps this list current after every
  // save, and the private copy this used to hold went stale the moment you
  // wrote an entry — so the entry you had just written was the one thing the
  // link picker could not offer you.
  const projectEntries = useMemo(() => project.entries || [], [project.entries])

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
            entries={projectEntries}
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
 * Everything recorded in a project so far.
 *
 * Two things make this harder than a table of rows.
 *
 * The first is that the values are not strings. Tags are a list, a checklist
 * is a list of objects, an entry link is an id. `entryValues` owns the
 * rendering of each, so a tag looks like a tag here, in the timeline and in
 * the export alike, instead of each view inventing its own `String(value)`.
 *
 * The second is that not every entry agrees about what the columns are. A
 * format change no longer rewrites what was already written, so an entry from
 * March holds March's fields. `columnsFor` works out the union — the project's
 * current fields first, then anything older that still holds values — and each
 * cell says for itself whether it was recorded under the current definition,
 * under an earlier one, or not at all. "Not recorded" is its own state, and a
 * visibly different one from an empty value: nobody answered, rather than
 * somebody answered with nothing.
 */
function EntryList({
  entries,
  project,
  projects = [],
  onOpenProject,
  onOpenEntry,
  canEdit = true,
}) {
  const [expanded, setExpanded] = useState(null)

  const columns = useMemo(() => columnsFor(project, entries), [project, entries])

  // The status of every project this schema links to, for the chips below.
  const linkedIds = useMemo(
    () => [
      ...new Set(
        columns
          .filter((field) => field.type === "project_reference")
          .map((field) => field.linked_project_id)
          .filter(Boolean)
      ),
    ],
    [columns]
  )
  useProjectStatuses(linkedIds)

  if (entries.length === 0) {
    return (
      <div className="entry-list-empty">
        <p className="hint">Nothing recorded yet.</p>
        <p className="hint-quiet">
          Fill in the form above and save — it will appear here straight away.
        </p>
      </div>
    )
  }

  const retiredCount = columns.filter((column) => column.retired).length

  return (
    <div className="entry-list">
      <div className="entry-list-head">
        <h3>Recorded so far</h3>
        <span className="entry-list-count">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}{" "}
          {retiredCount > 0 && (
            <span
              className="entry-list-note"
              title="Fields this project no longer asks for, kept because past entries recorded them"
            >
              · {retiredCount} no longer collected
            </span>
          )}
        </span>
      </div>

      <ul className="log-list" role="list">
        {entries.map((entry) => {
          const open = expanded === entry.id
          const written = schemaForEntry(entry, project)
          const olderFormat =
            written.length > 0 && !sameFormat(written, project.entry_schema || [])

          return (
            <li
              key={entry.id}
              className={`log-row ${entry.pending ? "is-unsynced" : ""} ${open ? "is-open" : ""}`}
            >
              <div className="log-row-main">
                <div className="log-fields">
                  {columns.map((column) => {
                    const { value, state, field } = cellFor(entry, column, project)
                    const meta = FIELD_TYPE_META[column.type]

                    // A field the project has dropped is shown only on the
                    // entries that actually recorded something under it.
                    // Printing "not recorded" for it on every entry written
                    // since would bury the live fields in history.
                    if (column.retired && value === NOT_RECORDED) return null

                    return (
                      <div
                        key={column.id}
                        className={`log-field ${isNumericField(column) ? "is-numeric" : ""} ${
                          column.retired ? "is-retired-column" : ""
                        }`}
                      >
                        <span
                          className="log-label"
                          title={
                            column.retired
                              ? `${column.name} — this project no longer asks for this`
                              : column.name
                          }
                        >
                          {column.name.length > 20 ? `${column.name.slice(0, 19)}…` : column.name}
                          {/* The registry's own colour, at a size that does not
                              compete with the value, with the word on hover. */}
                          {meta?.badge && (
                            <span
                              className={`log-type-dot is-${meta.color}`}
                              title={meta.badge}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="log-value">
                          <ValueView
                            value={value}
                            field={field}
                            state={state}
                            projects={projects}
                            entries={entries}
                            onOpenProject={onOpenProject}
                            onOpenEntry={onOpenEntry}
                          />
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="log-row-side">
                  <span className="log-time">
                    {/* Shown immediately, so that nobody re-types an entry
                        believing it failed to save. */}
                    {entry.pending && (
                      <span className={`sync-badge ${entry.rejected ? "is-rejected" : ""}`}>
                        {entry.rejected ? "Needs attention" : "Not yet synced"}
                      </span>
                    )}
                    <time dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    {/* Only named when known: entries written before a project
                        could be shared have no author, and an empty "logged by"
                        reads worse than none at all. */}
                    {entry.created_by_name && (
                      <span className="entry-author"> · {entry.created_by_name}</span>
                    )}
                    {olderFormat && (
                      <button
                        type="button"
                        className="entry-format-pill"
                        onClick={() => setExpanded(open ? null : entry.id)}
                        aria-expanded={open}
                        title="This entry was written under an earlier version of the project's format"
                      >
                        earlier format
                      </button>
                    )}
                  </span>

                  {/* The controls that were missing entirely: a record you
                      cannot correct is one people stop trusting. Revealed on
                      hover and focus so the list stays readable, but always
                      reachable by keyboard. */}
                  {!entry.pending && (
                    <div className="log-row-actions">
                      <button
                        type="button"
                        className="log-action"
                        onClick={() => onOpenEntry(entry)}
                        aria-label={`Open ${entrySummary(entry, written)}`}
                        title={canEdit ? "Open, correct or remove" : "Open"}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {open && (
                <div className="log-row-format">
                  <p>
                    Written when this project asked for:{" "}
                    <strong>{written.map((field) => field.name).join(", ") || "nothing"}</strong>.
                    Its values are shown exactly as recorded — changing the format
                    never rewrote them.
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatStat(value) {
  if (value === null || value === undefined) return "—"
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/**
 * Every field of a project, totalled or grouped according to its type
 * (US-2.10). The server reads each entry's schema snapshot, so a field that
 * has changed type still reports correctly for the entries written under the
 * old one.
 */
function FieldStatisticsPanel({ projectId }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!projectId) {
      setStats(null)
      return undefined
    }
    let active = true
    setLoading(true)
    setError(null)
    fetchFieldStatistics(projectId)
      .then((data) => {
        if (active) setStats(data)
      })
      .catch((err) => {
        if (active) {
          setStats(null)
          setError(formatError(err))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (!projectId) return null

  if (loading) {
    return <p className="field-stats-status" role="status">Working out the numbers…</p>
  }

  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    )
  }

  if (!stats || stats.fields.length === 0) {
    return (
      <p className="field-stats-status">
        Nothing to total yet — this project has no entries, or its fields are all free text.
      </p>
    )
  }

  return (
    <section className="field-stats" aria-label="Field statistics">
      <div className="timeline-summary">
        <h3>By field</h3>
        <p>
          {stats.fields.length} field{stats.fields.length === 1 ? "" : "s"} across the
          entries written so far. Numbers are totalled and averaged; choices and tags are
          grouped and counted.
        </p>
      </div>
      <div className="field-stats-grid">
        {stats.fields.map((field) => {
          const meta = FIELD_TYPE_META[field.type]
          const isNumeric = field.total !== null && field.total !== undefined
          // The API groups every non-number field by distinct value, in the
          // order first seen. Bars are only drawn for the types where a
          // breakdown by value means something — free text would be forty
          // bars of one — and are sorted so the largest group reads first.
          const groups = ["dropdown", "tags"].includes(field.type)
            ? [...field.groups].sort((a, b) => b.count - a.count)
            : []
          const largest = groups.reduce((max, group) => Math.max(max, group.count), 0)
          return (
            <article key={field.field_id} className="field-stats-card">
              <header className="field-stats-head">
                <h4>{field.name}</h4>
                <span className="field-summary-type">{meta?.label || field.type}</span>
              </header>
              <dl className="field-stats-figures">
                <div>
                  <dt>Entries</dt>
                  <dd>{field.count}</dd>
                </div>
                {isNumeric && (
                  <>
                    <div>
                      <dt>Total</dt>
                      <dd>{formatStat(field.total)}</dd>
                    </div>
                    <div>
                      <dt>Average</dt>
                      <dd>{formatStat(field.average)}</dd>
                    </div>
                  </>
                )}
              </dl>
              {groups.length > 0 && (
                <ul className="field-stats-groups" aria-label={`${field.name} by value`}>
                  {groups.map((group) => (
                    <li key={String(group.value)}>
                      <span className="field-stats-group-label">{String(group.value)}</span>
                      <span
                        className="field-stats-bar"
                        style={{ width: `${largest ? (group.count / largest) * 100 : 0}%` }}
                        aria-hidden="true"
                      />
                      <span className="field-stats-group-count">{group.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** Download text the browser has in hand, without a round trip for it. */
function download(filename, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick rather than immediately: Safari cancels an
  // in-flight download if the object URL goes away too soon.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A bucket label as something to put on an axis. */
function periodLabel(period, bucket) {
  if (bucket === "month") {
    return new Date(`${period}-01T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    })
  }
  return new Date(`${period}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

/**
 * How much has been written, and when.
 *
 * The brief's basic tier asks for "entries written over a week or a term", and
 * a term is a shape rather than a number — whether the work was steady or all
 * in the last fortnight is the thing worth seeing, and no single total shows
 * it. The server fills in empty periods, so a quiet fortnight draws as a
 * trough instead of closing up and disappearing.
 */
function ActivityPanel({ projectId, projects }) {
  const [bucket, setBucket] = useState("week")
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchActivity({ projectId: projectId || undefined, bucket })
      .then((data) => {
        if (active) setActivity(data)
      })
      .catch(() => {
        if (active) setActivity(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, bucket])

  const points = useMemo(
    () =>
      (activity?.points || []).map((point) => ({
        ...point,
        label: periodLabel(point.period, bucket),
        hours: Math.round((point.time_spent / 60) * 100) / 100,
      })),
    [activity, bucket]
  )

  const busiest = points.reduce(
    (best, point) => (point.entries > (best?.entries ?? -1) ? point : best),
    null
  )
  const written = points.reduce((sum, point) => sum + point.entries, 0)
  const scope = projectId
    ? projects.find((project) => project.id === projectId)?.name
    : "every project"

  return (
    <section className="stats-panel" aria-labelledby="activity-title">
      <header className="stats-panel-head">
        <div>
          <h3 id="activity-title">Entries over time</h3>
          <p>
            {written} {written === 1 ? "entry" : "entries"} across {scope}
            {busiest && busiest.entries > 0 && ` · busiest ${bucket}: ${busiest.label}`}
          </p>
        </div>
        <div className="stats-bucket" role="group" aria-label="Group activity by">
          {["day", "week", "month"].map((option) => (
            <button
              key={option}
              type="button"
              className={bucket === option ? "is-active" : ""}
              onClick={() => setBucket(option)}
            >
              {option === "day" ? "Daily" : option === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <SkeletonRows rows={1} height={240} label="Working out your activity" />
      ) : points.length === 0 ? (
        <p className="field-stats-status">
          Nothing written yet. Once you start capturing, this shows the rhythm of it.
        </p>
      ) : (
        <div className="stats-chart" aria-label="Entries over time">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={points} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <defs>
                {/* Stops are classed rather than coloured inline: a CSS
                    custom property resolves in a CSS property and not in an
                    SVG presentation attribute, so `stopColor="var(--blue)"`
                    silently produced no fill at all. */}
                <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop className="activity-fill-top" offset="0%" />
                  <stop className="activity-fill-bottom" offset="100%" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" vertical={false} />
              <XAxis
                dataKey="label"
                className="chart-axis"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={18}
              />
              <YAxis
                className="chart-axis"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value, name) =>
                  name === "hours" ? [`${value}h`, "Time logged"] : [value, "Entries"]
                }
              />
              <Area
                type="monotone"
                dataKey="entries"
                className="chart-area"
                strokeWidth={2}
                fill="url(#activity-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

/**
 * Time per project, which the brief names first among the statistics.
 *
 * A bar per project rather than a pie: comparing lengths is something people
 * do accurately and comparing angles is not, and the question here is almost
 * always "which of these is taking my time" rather than "what fraction".
 */
function ProjectTotalsPanel({ statistics, onOpenProject }) {
  const rows = useMemo(
    () =>
      (statistics?.projects || [])
        .map((project) => ({
          ...project,
          hours: Math.round((project.time_spent / 60) * 100) / 100,
        }))
        .sort((a, b) => b.time_spent - a.time_spent || b.entries - a.entries),
    [statistics]
  )

  if (rows.length === 0) return null

  const longest = rows[0]?.time_spent || 0

  return (
    <section className="stats-panel" aria-labelledby="totals-title">
      <header className="stats-panel-head">
        <div>
          <h3 id="totals-title">Time per project</h3>
          <p>Where the hours have actually gone, longest first.</p>
        </div>
      </header>

      <ul className="stats-bars" role="list">
        {rows.map((project) => (
          <li key={project.project_id} className={project.archived ? "is-archived" : ""}>
            <button
              type="button"
              className="stats-bar-label"
              onClick={() => onOpenProject(project.project_id)}
              title={`Open ${project.name}`}
            >
              {project.name}
              {project.archived && <span className="stats-bar-tag">Archived</span>}
            </button>
            <span className="stats-bar-track" aria-hidden="true">
              <span
                className="stats-bar-fill"
                style={{
                  width: `${
                    project.time_spent && longest
                      ? Math.max((project.time_spent / longest) * 100, 1.5)
                      : 0
                  }%`,
                  "--project-hue": projectHue(project.project_id),
                }}
              />
            </span>
            <span className="stats-bar-value">
              {formatDuration(project.time_spent)}
              <small>
                {project.entries} {project.entries === 1 ? "entry" : "entries"}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Statistics: the numbers, over fields the platform did not know about until
 * their owner defined them.
 *
 * This was called "Activity" and then "Statistics" while actually being a form
 * for plotting one field against a date range — which is why nobody could tell
 * what the tab was for. Browsing the record now lives in Timeline, and this is
 * only the numbers: the headline totals, time per project, the rhythm over
 * time, every field totalled or grouped, and one field plotted when you ask
 * for it. All of it exportable, because the brief says the record belongs to
 * its owner.
 */
function StatisticsPage({ projects, statistics, onOpenProject }) {
  const [projectId, setProjectId] = useState("")
  const [fieldId, setFieldId] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId]
  )

  const fields = selectedProject?.entry_schema || []
  const totals = statistics?.totals

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

  const exportStatistics = async () => {
    setExporting(true)
    setExportError("")
    try {
      const csv = await fetchStatisticsCsv(projectId || undefined)
      download(
        projectId
          ? `${selectedProject?.name || "project"} statistics.csv`
          : "chronicles-statistics.csv",
        csv
      )
    } catch (caught) {
      setExportError(formatError(caught))
    } finally {
      setExporting(false)
    }
  }

  const selectedField = fields.find((field) => field.id === fieldId)

  return (
    <section className="stats-page" aria-label="Statistics">
      <header className="stats-header">
        <div>
          <span className="workspace-eyebrow">WHAT IT ADDS UP TO</span>
          <h1>Statistics</h1>
          <p>
            Time per project, the rhythm of what you write, and any field you have
            defined — totalled, grouped and plotted, without the logbook having known
            about it in advance.
          </p>
        </div>
        <div className="stats-header-actions">
          <label className="stats-scope">
            <span className="sr-only">Narrow statistics to a project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Whole logbook</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={exportStatistics}
            disabled={exporting}
            title="Download these figures as a spreadsheet"
          >
            {exporting ? "Preparing…" : "Export CSV"}
          </button>
        </div>
      </header>

      {exportError && (
        <p className="error" role="alert">
          {exportError}
        </p>
      )}

      {/* The headline figures the brief asks for by name: time per project,
          how much has been written, and the run of days kept up. */}
      <div className="stats-tiles">
        <article>
          <span>Time logged</span>
          <strong>{totals ? formatDuration(totals.time_spent) : "–"}</strong>
          <small>
            {totals ? `${totals.entries} ${totals.entries === 1 ? "entry" : "entries"}` : " "}
          </small>
        </article>
        <article>
          <span>Active days</span>
          <strong>{totals ? totals.active_days : "–"}</strong>
          <small>days with something written</small>
        </article>
        <article className={totals?.current_streak > 0 ? "is-alive" : ""}>
          <span>Current streak</span>
          <strong>{totals ? totals.current_streak : "–"}</strong>
          <small>
            {totals ? `longest run: ${totals.longest_streak} days` : " "}
          </small>
        </article>
        <article>
          <span>Projects</span>
          <strong>{totals ? totals.active_projects : "–"}</strong>
          <small>{totals ? `${totals.archived_projects} archived` : " "}</small>
        </article>
      </div>

      <ActivityPanel projectId={projectId} projects={projects} />

      {!projectId && <ProjectTotalsPanel statistics={statistics} onOpenProject={onOpenProject} />}

      {/* Every field, totalled or grouped, as soon as a project is chosen. */}
      {projectId ? (
        <FieldStatisticsPanel projectId={projectId} />
      ) : (
        <p className="field-stats-status">
          Choose a project above to total and group every field you have defined in it.
        </p>
      )}

      <section className="stats-panel" aria-labelledby="plot-title">
        <header className="stats-panel-head">
          <div>
            <h3 id="plot-title">Plot one field over time</h3>
            <p>Any field you have defined, against the dates you wrote it.</p>
          </div>
        </header>

        <form className="timeline-filters" onSubmit={handleLoadTimeline}>
          <label className="field-label">
            Field
            <select
              value={fieldId}
              onChange={(event) => setFieldId(event.target.value)}
              disabled={!projectId}
              aria-label="Select field"
            >
              <option value="">{projectId ? "Select a field" : "Choose a project first"}</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            From
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              aria-label="Start date"
            />
          </label>

          <label className="field-label">
            To
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
            {loading ? "Loading…" : "Plot it"}
          </button>
        </form>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {loading && <SkeletonRows rows={1} height={260} label="Plotting" />}

        {timeline && !loading && (
          <div className="timeline-results">
            <div className="timeline-summary">
              <h4>{timeline.field_name}</h4>
              <p>
                {timeline.points.length} data point
                {timeline.points.length === 1 ? "" : "s"}
                {selectedField?.type && (
                  <span className="timeline-field-type">
                    {" "}
                    • {fieldTypeLabel(selectedField.type)}
                  </span>
                )}
              </p>
            </div>

            {timeline.points.length === 0 ? (
              <p className="hint">No values found for this field in the selected range.</p>
            ) : (
              <>
                <div className="timeline-chart" aria-label={`${timeline.field_name} over time`}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={timeline.points.map((point) => ({
                        ...point,
                        date: new Date(point.created_at).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        }),
                        displayValue: String(point.value),
                        numericValue:
                          timeline.field_type === "number" ? Number(point.value) : null,
                      }))}
                      margin={{ top: 10, right: 16, left: -14, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="chart-grid" vertical={false} />
                      <XAxis dataKey="date" className="chart-axis" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis className="chart-axis" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={timeline.field_type === "number" ? "numericValue" : "displayValue"}
                        name={timeline.field_name}
                        className="chart-line"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
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
                        <th scope="col">Format version</th>
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
  onDeleteProject,
  onOpenProject,
  onOpenEntry,
  onLeftProject,
}) {
  const [tab, setTab] = useState("entries")
  // First-visit guidance for each tab, shown once. Held here rather than in
  // `App` because the tab is the thing being explained and only this component
  // knows which one is open.
  const [seen, setSeen] = useState(seenTours)
  const hint = PROJECT_TOURS[tab]
  const showHint = hint && !seen.includes(hint.id)

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
              project={project}
              projects={projects}
              onOpenProject={onOpenProject}
              onOpenEntry={onOpenEntry}
              canEdit={!project.archived}
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
          <LeaveProjectControl project={project} onLeft={onLeftProject} />
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

      {showHint && (
        <PageHint
          hint={hint}
          onDismiss={() => setSeen((current) => [...current, hint.id])}
        />
      )}
    </section>
  )
}

/**
 * Stepping away from a project somebody shared with you.
 *
 * The other half of an invitation. Accepting used to be the only move
 * available — there was no way to hand a project back, which made "share"
 * closer to "assign". Confirmed rather than instant, because the entries you
 * wrote stay behind and it is worth saying so before rather than after.
 */
function LeaveProjectControl({ project, onLeft }) {
  const [confirming, setConfirming] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState("")

  const leave = async () => {
    setLeaving(true)
    setError("")
    try {
      await leaveProject(project.id)
      onLeft(project.id)
    } catch (caught) {
      setError(formatError(caught))
      setLeaving(false)
    }
  }

  return (
    <div className="detail-shared">
      <p className="detail-shared-note">
        Shared with you. You can add entries here and correct your own; changing
        the project&rsquo;s fields, archiving and exporting stay with its owner.
      </p>

      {confirming ? (
        <div className="detail-leave-confirm">
          <p>
            Leave <strong>{project.name}</strong>? It disappears from your workspace.
            The entries you wrote stay in the project — they are part of its record.
            Its owner can invite you back.
          </p>
          <div className="detail-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirming(false)}
              disabled={leaving}
            >
              Stay
            </button>
            <button type="button" className="btn-danger" onClick={leave} disabled={leaving}>
              {leaving ? "Leaving…" : "Leave project"}
            </button>
          </div>
        </div>
      ) : (
        <div className="detail-footer-actions">
          <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
            Leave project
          </button>
        </div>
      )}

      {error && (
        <p className="share-error" role="alert">
          {error}
        </p>
      )}
    </div>
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
      // Inviting is idempotent on the server, so re-inviting someone returns
      // their existing invitation rather than failing — replace their row
      // rather than listing them twice.
      setMembers((current) =>
        current.some((person) => person.user_id === member.user_id)
          ? current.map((person) => (person.user_id === member.user_id ? member : person))
          : [...current, member]
      )
      setEmail("")
      setNotice(
        member.status === "accepted"
          ? `${member.full_name} already has access to this project.`
          : `Invitation sent to ${member.full_name}. Nothing is shared until they accept.`
      )
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
      <h4 className="share-title">Shared with</h4>
      <p className="share-hint">
        An invitation, not a hand-over: nothing reaches them until they accept.
        Once they do they can read this project and write entries in it. Only you
        can change its fields, archive it or export it.
      </p>

      {members.length === 0 ? (
        <p className="share-empty">Nobody has been invited yet.</p>
      ) : (
        <ul className="share-members">
          {members.map((member) => (
            <li key={member.user_id} className={`share-member is-${member.status}`}>
              <span className="share-member-name">
                {member.full_name}
                {/* Without this an owner cannot tell an unanswered invitation
                    from a silent failure, and sends it again. */}
                {member.status === "pending" && (
                  <span className="share-status is-pending" title="Waiting for them to accept">
                    Invited
                  </span>
                )}
                {member.status === "declined" && (
                  <span className="share-status is-declined" title="They turned this invitation down">
                    Declined
                  </span>
                )}
              </span>
              <span className="share-member-email">{member.email}</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => revoke(member)}
              >
                {member.status === "accepted" ? "Remove" : "Cancel"}
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
          {isSharing ? "Inviting…" : "Send invitation"}
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
  // The entry currently open for reading, correcting or removing. Held here
  // rather than in each list, because the same panel serves the project view,
  // the timeline and the entries table.
  const [openEntry, setOpenEntry] = useState(null)
  // Which guided tours this person has already been shown. Read once and kept
  // in state so dismissing one re-renders without a second storage read.
  const [toursSeen, setToursSeen] = useState(seenTours)
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const validViews = ["home", "today", "timeline", "statistics", "assistant", "entries", "tasks", "board", "outstanding", "calendar"]
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
        setSelectedId(project.id)
      setIsModalOpen(false)
    } catch (err) {
      setError(formatError(err))
    }
  }

  const handleSelectProject = (id) => {
    setSelectedId(id)
    setCurrentView("home")
  }

  const handleShowStatistics = () => {
    setSelectedId(null)
    setCurrentView("statistics")
  }

  const handleSeedDemoData = async () => {
    try {
      const data = await seedDemoData()
      setProjects(data)
      if (data.length > 0) {
        setSelectedId(data[0].id)
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
    // What was on screen no longer exists, so fall back to the workspace rather
    // than leaving the detail panel pointed at a project that is gone.
    setSelectedId(null)
  }

  /** Leaving a shared project is the same outcome, by a different route. */
  const handleLeftProject = handleDeleteProject

  /**
   * An entry opened for reading, correcting or removing.
   *
   * The timeline and the entries table return rows that carry `project_id` but
   * not the project itself, so the project is resolved here — one place that
   * knows how to pair an entry with the format it belongs to.
   */
  const entryContext = useMemo(() => {
    if (!openEntry) return null
    const project =
      projects.find((candidate) => candidate.id === openEntry.project_id) || selectedProject
    return project ? { entry: openEntry, project } : null
  }, [openEntry, projects, selectedProject])

  const handleEntrySaved = (saved) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === saved.project_id
          ? {
              ...project,
              entries: (project.entries || []).map((entry) =>
                entry.id === saved.id ? saved : entry
              ),
            }
          : project
      )
    )
    setOpenEntry(saved)
  }

  const handleEntryDeleted = (deletedId) => {
    setProjects((previous) =>
      previous.map((project) => ({
        ...project,
        entries: (project.entries || []).filter((entry) => entry.id !== deletedId),
      }))
    )
    setOpenEntry(null)
  }

  const showWelcome = !toursSeen.includes(WELCOME_TOUR.id)

  /**
   * The one-card hint for the page currently open, if it has not been seen.
   *
   * Suppressed while a project is open, because `ProjectDetail` explains its
   * own tabs and two cards at once would be an ambush rather than help.
   */
  const pageHint = useMemo(() => {
    if (showWelcome) return null
    if (currentView === "home" && selectedProject) return null
    const hint = PAGE_TOURS[currentView]
    return hint && !toursSeen.includes(hint.id) ? hint : null
  }, [currentView, selectedProject, toursSeen, showWelcome])

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
      <AmbientBackground />
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
              onClick={() => { setCurrentView("home"); setSelectedId(null) }}
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
            {/* The record itself, which the brief puts above everything else.
                It sits second because it is the thing people come back for. */}
            <button
              type="button"
              className={`nav-item ${currentView === "timeline" ? "active" : ""}`}
              onClick={() => setCurrentView("timeline")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="12" y1="3" x2="12" y2="21" />
                <circle cx="12" cy="7" r="2" />
                <circle cx="12" cy="17" r="2" />
                <line x1="14" y1="7" x2="20" y2="7" />
                <line x1="4" y1="17" x2="10" y2="17" />
              </svg>
              <span>Timeline</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === "statistics" ? "active" : ""}`}
              onClick={() => setCurrentView("statistics")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="4" y1="20" x2="4" y2="12" />
                <line x1="10" y1="20" x2="10" y2="4" />
                <line x1="16" y1="20" x2="16" y2="9" />
                <line x1="22" y1="20" x2="22" y2="14" />
              </svg>
              <span>Statistics</span>
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
            <button
              type="button"
              className="nav-capture"
              onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_CAPTURE))}
              title="Capture an entry (Ctrl + Enter)"
              aria-label="Capture an entry"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Capture</span>
            </button>
            <OfflineStatus userId={userId} projects={projects} />
            {/* Renders nothing at all when there is nothing waiting — a
                permanently empty bell teaches people to stop looking at it. */}
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
            onShowHome={() => setSelectedId(null)}
            homeActive={!selectedProject}
            onShowTimeline={() => setCurrentView("timeline")}
            onShowStatistics={handleShowStatistics}
          />
        </div>}
        <div className="content">
          {/* Keyed on the view *and* the open project, so switching tabs and
              switching projects both animate, while a data refresh inside one
              view does not. */}
          <ViewTransition viewKey={`${currentView}:${selectedId || "none"}`}>
            {loading ? (
              <ViewLoader label="Opening your logbook…" delay={0} />
            ) : currentView === "calendar" ? (
              <CalendarView projects={projects} />
            ) : currentView === "today" ? (
              <TodayPage projects={projects} onNavigate={setCurrentView} onCreateProject={() => setIsModalOpen(true)} />
            ) : currentView === "timeline" ? (
              <TimelinePage
                projects={projects}
                onOpenEntry={setOpenEntry}
                onOpenProject={handleSelectProject}
                onCreateProject={() => setIsModalOpen(true)}
              />
            ) : currentView === "statistics" ? (
              <StatisticsPage
                projects={projects}
                statistics={statistics}
                onOpenProject={handleSelectProject}
              />
            ) : currentView === "assistant" ? (
              <MiraAssistantPage conversation={miraConversation} />
            ) : currentView === "tasks" ? (
              <TasksPage projects={projects} onCreate={() => setIsModalOpen(true)} />
            ) : currentView === "entries" ? (
              <EntriesPage
                projects={projects}
                onCreate={() => setIsModalOpen(true)}
                onOpenEntry={setOpenEntry}
              />
            ) : currentView === "board" ? (
              <BoardView projects={projects} />
            ) : currentView === "outstanding" ? (
              <OutstandingPage projects={projects} onNavigate={setCurrentView} />
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
                onDeleteProject={handleDeleteProject}
                onOpenProject={handleSelectProject}
                onOpenEntry={setOpenEntry}
                onLeftProject={handleLeftProject}
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
      <CommandPalette projects={projects} onNavigate={setCurrentView} onOpenProject={handleSelectProject} onCreateProject={() => setIsModalOpen(true)} onShowStatistics={handleShowStatistics} />
      {currentView !== "assistant" && <MiraLauncher conversation={miraConversation} open={miraOpen} onToggle={() => setMiraOpen(value => !value)} onOpenFull={() => { setMiraOpen(false); setCurrentView("assistant") }} />}

      {/* Capture from anywhere, without navigating to a project first. The
          brief is blunt about why: an entry that takes a minute to file will
          not be filed. */}
      <QuickCapture
        projects={projects}
        onCaptured={async () => { await loadProjects(); await loadEntries() }}
        onOpenProject={handleSelectProject}
      />

      {/* Reading, correcting or removing one entry. One panel for every list
          that can open one, so the three of them cannot drift apart. */}
      {entryContext && (
        <EntryEditor
          entry={entryContext.entry}
          project={entryContext.project}
          projects={projects}
          canEdit={!entryContext.project.archived}
          onClose={() => setOpenEntry(null)}
          onSaved={handleEntrySaved}
          onDeleted={handleEntryDeleted}
          onOpenProject={(id) => {
            setOpenEntry(null)
            handleSelectProject(id)
          }}
        />
      )}

      {/* Guidance. The welcome tour runs once and takes precedence; after that
          each page explains itself the first time it is opened, which is the
          only moment the explanation is worth reading. */}
      {!loading && showWelcome ? (
        <WelcomeTour
          tour={WELCOME_TOUR}
          onFinish={() => setToursSeen((current) => [...current, WELCOME_TOUR.id])}
        />
      ) : (
        !loading &&
        pageHint && (
          <PageHint
            hint={pageHint}
            onDismiss={() => setToursSeen((current) => [...current, pageHint.id])}
          />
        )
      )}
    </div>
  )
}

export default App
