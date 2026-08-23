import { TaskPanel } from "./TaskPanel"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  archiveProject,
  createEntry,
  createProject,
  deleteAccount,
  fetchEntries,
  fetchEntriesGlobal,
  fetchProjects,
  unarchiveProject,
  updateProject,
} from "./api"
import "./App.css"
import "./tasks.css"

const FIELD_TYPES = ["text", "number", "date", "dropdown"]

function generateId() {
  return `field-${Math.random().toString(36).slice(2, 9)}`
}

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes))
    return "—"
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
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

function UserMenu({ userName, onSignOut, onDeleteAccount, theme, cycleTheme }) {
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

  const themeIcons = {
    light: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    dark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    system: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  }

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
            onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>Notifications</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>
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
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => { cycleTheme(); }}
          >
            {themeIcons[theme]}
            <span>Theme: {theme}</span>
          </button>
          <div className="user-dropdown-divider" />
          <button
            type="button"
            className="user-dropdown-item user-dropdown-profile"
            role="menuitem"
            onClick={() => setOpen(false)}
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
  const [theme, cycleTheme] = useTheme()
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

  const clearSession = () => {
    window.localStorage.removeItem("chronicles_token")
    window.localStorage.removeItem("chronicles_user")
    setUser(null)
    window.location.assign("/")
  }

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
          theme={theme}
          cycleTheme={cycleTheme}
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

function LogoIcon({ className, size = 40 }) {
  return (
    <div className="logo-c-wrap" style={{ width: size, height: size }}>
      <div className="logo-c-ring" />
      <span className="logo-c-letter">C</span>
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

function ProjectList({ projects, selectedId, onSelect, onCreate, onShowTimeline, timelineActive }) {
  const [showArchived, setShowArchived] = useState(false)
  const activeProjects = projects.filter((project) => !project.archived)
  const archivedProjects = projects.filter((project) => project.archived)

  return (
    <aside className="sidebar">
      <button
        type="button"
        className={`project-button timeline-button ${timelineActive ? "active" : ""}`}
        onClick={onShowTimeline}
      >
        Timeline
      </button>
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
      {activeProjects.length === 0 && archivedProjects.length === 0 ? (
        <p className="sidebar-empty">No projects yet.</p>
      ) : (
        <>
          {activeProjects.length === 0 ? (
            <p className="sidebar-empty">No active projects.</p>
          ) : (
            <ul className="project-list" role="listbox" aria-label="Projects">
              {activeProjects.map((project) => (
                <li key={project.id} role="option" aria-selected={project.id === selectedId}>
                  <button
                    type="button"
                    className={`project-button ${project.id === selectedId ? "active" : ""}`}
                    onClick={() => onSelect(project.id)}
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {archivedProjects.length > 0 && (
            <div className="archived-section">
              <button
                type="button"
                className="btn-text archived-toggle"
                onClick={() => setShowArchived((current) => !current)}
                aria-expanded={showArchived}
              >
                {showArchived ? "Hide" : "Show"} archived ({archivedProjects.length})
              </button>
              {showArchived && (
                <ul
                  className="project-list archived-list"
                  role="listbox"
                  aria-label="Archived projects"
                >
                  {archivedProjects.map((project) => (
                    <li key={project.id} role="option" aria-selected={project.id === selectedId}>
                      <button
                        type="button"
                        className={`project-button archived ${
                          project.id === selectedId ? "active" : ""
                        }`}
                        onClick={() => onSelect(project.id)}
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

function CalendarView({ projects }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthName = currentDate.toLocaleString("default", { month: "long" })
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => {
    const now = new Date()
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(now)
  }

  const isToday = (day) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear()

  const isSelected = (day) =>
    day === selectedDate.getDate() &&
    month === selectedDate.getMonth() &&
    year === selectedDate.getFullYear()

  const days = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const weekDays = ["S", "M", "T", "W", "T", "F", "S"]

  const entriesByDate = useMemo(() => {
    const map = new Map()
    projects.forEach((project) => {
      (project.entries || []).forEach((entry) => {
        const dateKey = new Date(entry.created_at).toISOString().split("T")[0]
        if (!map.has(dateKey)) map.set(dateKey, [])
        map.get(dateKey).push({ ...entry, projectName: project.name })
      })
    })
    return map
  }, [projects])

  const selectedKey = selectedDate.toISOString().split("T")[0]
  const selectedEntries = entriesByDate.get(selectedKey) || []

  return (
    <div className="project-detail calendar-view">
      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="calendar-header">
            <div className="calendar-title">
              <h2>{monthName} <span className="calendar-year">{year}</span></h2>
              <p className="calendar-subtitle">Select a date to see your entries</p>
            </div>
            <div className="calendar-controls">
              <button type="button" className="btn-text calendar-today" onClick={goToToday}>
                Today
              </button>
              <button type="button" className="btn-icon" onClick={prevMonth} aria-label="Previous month">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button type="button" className="btn-icon" onClick={nextMonth} aria-label="Next month">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
          <div className="calendar-body">
            <div className="calendar-weekdays">
              {weekDays.map((day, i) => (
                <div key={i} className="calendar-weekday">{day}</div>
              ))}
            </div>
            <div className="calendar-grid">
              {days.map((day, index) => {
                const key = day ? new Date(year, month, day).toISOString().split("T")[0] : null
                const entries = key ? entriesByDate.get(key) || [] : []
                return (
                  <button
                    key={index}
                    type="button"
                    className={`calendar-day ${!day ? "empty" : ""} ${day && isToday(day) ? "today" : ""} ${day && isSelected(day) ? "selected" : ""}`}
                    onClick={() => day && setSelectedDate(new Date(year, month, day))}
                    disabled={!day}
                  >
                    <span className="day-number">{day}</span>
                    {entries.length > 0 && (
                      <span className="calendar-dots">
                        {entries.slice(0, 3).map((_, i) => (
                          <span key={i} className="calendar-dot" />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <aside className="calendar-side" aria-label="Selected date details">
          <div className="calendar-side-head">
            <h3>{selectedDate.toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric" })}</h3>
            <span className={`day-badge ${isToday(selectedDate.getDate()) && selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear() ? "today" : ""}`}>
              {selectedDate.toLocaleDateString("default", { month: "short", day: "numeric" })}
            </span>
          </div>
          <div className="calendar-side-body">
            {selectedEntries.length === 0 ? (
              <div className="calendar-side-empty">
                <p>No entries logged for this day.</p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => {}}>
                  Log an entry
                </button>
              </div>
            ) : (
              <ul className="calendar-entry-list" role="list">
                {selectedEntries.map((entry) => (
                  <li key={entry.id} className="calendar-entry-item">
                    <div className="calendar-entry-dot" />
                    <div className="calendar-entry-body">
                      <span className="calendar-entry-project">{entry.projectName}</span>
                      <span className="calendar-entry-time">{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function SchemaBuilder({ project, onSave, disabled, onSwitchToEntries }) {
  const [fields, setFields] = useState(() => project.entry_schema || [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const hasChanges = useMemo(() => {
    const initialFields = project.entry_schema || []
    return JSON.stringify(fields) !== JSON.stringify(initialFields)
  }, [fields, project.entry_schema])

  useEffect(() => {
    setFields(project.entry_schema || [])
    setError(null)
    setSaveSuccess(false)
  }, [project.id, project.entry_schema])

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: generateId(), name: "", type: "text", options: [] },
    ])
  }

  const removeField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const updateField = (index, patch) => {
    setFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, ...patch } : field))
    )
  }

  const validateSchema = () => {
    const names = new Set()
    for (const field of fields) {
      if (!field.name.trim()) return "Every field needs a name."
      if (names.has(field.name.trim())) return `Duplicate field name: ${field.name}`
      names.add(field.name.trim())
      if (field.type === "dropdown") {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          return `Field "${field.name}" needs at least one dropdown option.`
        }
      }
    }
    return null
  }

  const handleSave = async () => {
    const validationError = validateSchema()
    if (validationError) {
      setError(validationError)
      return
    }
    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      await onSave({ entry_schema: fields })
      setSaveSuccess(true)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="schema-builder">
      <div className="panel-head">
        <h3>Entry schema</h3>
        <p>Define the fields and types for this logbook.</p>
      </div>
      {fields.length === 0 ? (
        <p className="hint">No fields yet. Add one to get started.</p>
      ) : (
        <div className="field-list">
          {fields.map((field, index) => (
            <div key={index} className="field-card">
              <div className="field-row">
                <label className="field-label">
                  Name
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => updateField(index, { name: e.target.value })}
                    placeholder="Field name"
                  />
                </label>
                <label className="field-label">
                  Type
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, {
                        type: e.target.value,
                        options:
                          e.target.value === "dropdown" ? [""] : field.options,
                      })
                    }
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {field.type === "dropdown" && (
                <label className="field-label full">
                  Options (comma-separated)
                  <input
                    type="text"
                    value={field.options.join(", ")}
                    onChange={(e) =>
                      updateField(index, {
                        options: e.target.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </label>
              )}
              <button
                type="button"
                className="btn-text-danger"
                onClick={() => removeField(index)}
              >
                Remove field
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {saveSuccess && (
        <div className="success" role="status">
          <p>Schema saved.</p>
          <button type="button" className="btn-text" onClick={onSwitchToEntries}>
            Go to Entries to start logging
          </button>
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={addField}>
          Add field
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={disabled || isSaving || !hasChanges}
        >
          {isSaving ? "Saving…" : "Save schema"}
        </button>
      </div>
    </div>
  )
}

function EntryForm({ project, onCreated }) {
  const schema = project.entry_schema || []
  const [data, setData] = useState({})
  const [hours, setHours] = useState("")
  const [minutes, setMinutes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData({})
    setHours("")
    setMinutes("")
    setError(null)
  }, [project.id])

  const handleChange = (fieldId, value) => {
    setData((prev) => ({ ...prev, [fieldId]: value }))
  }

  const parseDuration = () => {
    const h = hours === "" ? 0 : Number(hours)
    const m = minutes === "" ? 0 : Number(minutes)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    if (h < 0 || m < 0) return null
    const total = Math.round(h) * 60 + Math.round(m)
    return total > 0 ? total : null
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
      const payload = { ...data }
      for (const field of schema) {
        if (field.type === "number" && payload[field.id] !== undefined) {
          payload[field.id] = Number(payload[field.id])
        }
      }
      await onCreated({ data: payload, time_spent: parseDuration() })
      setData({})
      setHours("")
      setMinutes("")
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
          <label key={field.id} className="field-label">
            {field.name}
            {field.type === "dropdown" ? (
              <select
                value={data[field.id] || ""}
                onChange={(e) => handleChange(field.id, e.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={data[field.id] || ""}
                onChange={(e) => handleChange(field.id, e.target.value)}
                placeholder={field.name}
                required
              />
            )}
          </label>
        ))}
      </div>
      <div className="duration-inputs">
        <span className="duration-label">Time spent</span>
        <label className="field-label duration-field">
          Hours spent
          <input
            type="number"
            min="0"
            step="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="field-label duration-field">
          Minutes spent
          <input
            type="number"
            min="0"
            max="59"
            step="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
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

function EntryList({ entries, schema }) {
  if (entries.length === 0) {
    return <p className="hint">No entries yet.</p>
  }

  return (
    <div className="entry-list">
      <h3>Recent entries</h3>
      <ul className="log-list" role="list">
        {entries.map((entry) => (
          <li key={entry.id} className="log-row">
            <div className="log-fields">
              {schema.map((field) => (
                <div key={field.id} className="log-field">
                  <span className="log-label">{field.name}</span>
                  <span className="log-value">
                    {String(entry.data[field.id] ?? "—")}
                  </span>
                </div>
              ))}
              <div className="log-field">
                <span className="log-label">Time spent</span>
                <span className="log-value">{formatDuration(entry.time_spent)}</span>
              </div>
            </div>
            <span className="log-time">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Timeline({ projects }) {
  const [entries, setEntries] = useState([])
  const [q, setQ] = useState("")
  const [projectId, setProjectId] = useState("")
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setPage(1)
    setHasNextPage(true)
  }, [q, projectId])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchEntriesGlobal({
          q,
          projectId,
          page,
          pageSize: 20,
        })

        if (!cancelled) {
          setEntries(data)
          setHasNextPage(data.length === 20)
        }
      } catch (err) {
        if (!cancelled) setError(formatError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [q, projectId, page])

  const schemaByProject = useMemo(() => {
    const map = {}
    for (const project of projects) {
      map[project.id] = project.entry_schema || []
    }
    return map
  }, [projects])

  const getFieldName = (entryProjectId, fieldId) => {
    const schema = schemaByProject[entryProjectId] || []
    const field = schema.find((f) => f.id === fieldId)
    return field?.name || fieldId
  }

  return (
    <section className="timeline" aria-label="Timeline">
      <header className="timeline-header">
        <h2>Timeline</h2>
        <p>Search across all entries and filter by project.</p>
      </header>
      <div className="timeline-filters">
        <label className="field-label">
          Search
          <input
            type="text"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search entries…"
            aria-label="Search entries"
          />
        </label>
        <label className="field-label">
          Project
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
            {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="hint">No entries found.</p>
      ) : (
        <>
          <ul className="timeline-list" role="list">
            {entries.map((entry) => (
              <li key={entry.id} className="timeline-row">
                <div className="timeline-meta">
                  <span className="timeline-project">
                    {entry.project_name}
                  </span>
                  <span className="timeline-time">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="timeline-fields">
                  {Object.entries(entry.data).map(([fieldId, value]) => (
                    <div key={fieldId} className="timeline-field">
                      <span className="timeline-label">
                        {getFieldName(entry.project_id, fieldId)}
                      </span>
                      <span className="timeline-value">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="timeline-pagination">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </button>

            <span>Page {page}</span>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={!hasNextPage || loading}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function ProjectDetail({
  project,
  onSchemaSaved,
  onEntryCreated,
  onEditProject,
  onToggleArchive,
}) {
  const [tab, setTab] = useState("entries")

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
            {project.entry_schema?.length || 0} field
            {project.entry_schema?.length === 1 ? "" : "s"}
            {" · "}
            Total time: {formatDuration(project.total_time_spent)}
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
              <EntryForm project={project} onCreated={onEntryCreated} />
            )}
            <EntryList entries={project.entries || []} schema={project.entry_schema || []} />
          </>
        ) : tab === "schema" ? (
          <SchemaBuilder
            project={project}
            onSave={onSchemaSaved}
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

function TodayPanel({ projects, selectedProject, onCreateProject, onViewCalendar }) {
  const today = new Date()
  const todayKey = today.toISOString().split("T")[0]
  const todayEntries = projects.flatMap((p) =>
    (p.entries || []).filter((e) => e.created_at.startsWith(todayKey))
  )
  const entryCount = todayEntries.length

  const handleQuickLog = () => {
    if (selectedProject) {
      document.getElementById("entry-quick-note")?.focus()
    } else {
      onCreateProject()
    }
  }

  return (
    <div className="today-panel">
      <div className="today-main">
        <div className="today-date-block">
          <span className="today-day">{today.toLocaleDateString("default", { weekday: "long" })}</span>
          <span className="today-date">{today.toLocaleDateString("default", { day: "numeric", month: "long" })}</span>
        </div>
        <div className="today-summary">
          <h2>{entryCount === 0 ? "Start today's log" : `${entryCount} entr${entryCount === 1 ? "y" : "ies"} today`}</h2>
          <p>{entryCount === 0 ? "Capture what you're working on while it's fresh." : "Keep the momentum going."}</p>
        </div>
      </div>
      <div className="today-actions">
        <button type="button" className="btn-primary" onClick={handleQuickLog}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {selectedProject ? "Log today's entry" : "Create a project"}
        </button>
        <button type="button" className="btn-secondary" onClick={onViewCalendar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          View calendar
        </button>
      </div>
    </div>
  )
}

function App() {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState("project")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [currentView, setCurrentView] = useState("home")

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

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || null,
    [projects, selectedId]
  )

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

  const handleEntryCreated = async ({ data, time_spent }) => {
    if (!selectedProject) return
    const entry = await createEntry(selectedProject.id, { data, time_spent })
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== selectedProject.id) return project
        const currentTotal = project.total_time_spent || 0
        const addedTime = entry.time_spent || 0
        return {
          ...project,
          entries: [entry, ...(project.entries || [])],
          total_time_spent: currentTotal + addedTime,
        }
      })
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
              {/* Person sitting with book */}
              <g transform="translate(260, 208) scale(0.6)">
                <circle cx="12" cy="8" r="6" />
                <path d="M6,16 Q0,32 8,42 L24,42 Q32,32 26,16 Z" />
                <path d="M8,42 L6,58 M22,42 L24,58" />
                <rect x="14" y="24" width="16" height="10" rx="1" transform="rotate(-15 22 29)" />
              </g>
              {/* Person standing pointing */}
              <g transform="translate(560, 196) scale(0.65)">
                <circle cx="12" cy="8" r="6" />
                <path d="M6,16 L6,44 L18,44 L18,16 Z" />
                <path d="M6,22 L-2,14 L-2,20 L6,26 Z" />
                <path d="M18,22 L28,18" />
                <path d="M8,44 L5,62 M16,44 L19,62" />
              </g>
              {/* Child playing / running */}
              <g transform="translate(860, 215) scale(0.45)">
                <circle cx="12" cy="8" r="6" />
                <path d="M6,16 L8,38 L18,36 L16,16 Z" />
                <path d="M8,24 L-2,22 L-4,30 L6,32 Z" />
                <path d="M16,24 L26,20 L28,28 L18,30 Z" />
                <path d="M8,38 L4,54 M18,36 L22,52" />
              </g>
              {/* Person with raised arms celebrating / planning */}
              <g transform="translate(1120, 188) scale(0.7)">
                <circle cx="12" cy="10" r="6" />
                <path d="M6,18 L6,46 L18,46 L18,18 Z" />
                <path d="M6,22 L-2,8 M18,22 L26,8" />
                <path d="M8,46 L6,64 M16,46 L18,64" />
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
              onClick={() => setCurrentView("home")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
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
              <span>Entries</span>
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
              <span>Tasks</span>
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
            <AuthActions />
          </div>
        </nav>
      </header>
      <main className="app-main">
        {error && (
          <div className="global-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="sidebar-stack">
          <ProjectList
            projects={projects}
            selectedId={selectedId}
            onSelect={handleSelectProject}
            onCreate={() => setIsModalOpen(true)}
            onShowTimeline={handleShowTimeline}
            timelineActive={view === "timeline"}
          />
          <DashboardPanel
            projects={projects}
            onCreate={() => setIsModalOpen(true)}
          />
        </div>
        <div className="content">
          {loading ? (
            <p className="hint">Loading…</p>
          ) : currentView === "calendar" ? (
            <CalendarView projects={projects} />
          ) : currentView === "tasks" ? (
            <div className="project-detail">
              <div className="detail-header">
                <h2>Tasks</h2>
                <p className="detail-description">Your tasks and deadlines will appear here.</p>
              </div>
              <div className="detail-body">
                <p className="hint">Task management coming soon.</p>
              </div>
            </div>
          ) : currentView === "entries" ? (
            <div className="project-detail">
              <div className="detail-header">
                <h2>All entries</h2>
                <p className="detail-description">Browse and search across all your logbook entries.</p>
              </div>
              <div className="detail-body">
                <p className="hint">Global entry view coming soon.</p>
              </div>
            </div>
          ) : view === "timeline" ? (
            <Timeline projects={projects} />
          ) : selectedProject ? (
            <ProjectDetail
              key={selectedProject.id}
              project={selectedProject}
              onSchemaSaved={handleProjectUpdate}
              onEntryCreated={handleEntryCreated}
              onEditProject={() => setIsEditModalOpen(true)}
              onToggleArchive={handleToggleArchive}
            />
          ) : (
            <>
              <TodayPanel
                projects={projects}
                selectedProject={selectedProject}
                onCreateProject={() => setIsModalOpen(true)}
                onViewCalendar={() => setCurrentView("calendar")}
              />
              {selectedProject ? (
                <ProjectDetail
                  key={selectedProject.id}
                  project={selectedProject}
                  onSchemaSaved={handleProjectUpdate}
                  onEntryCreated={handleEntryCreated}
                  onEditProject={() => setIsEditModalOpen(true)}
                  onToggleArchive={handleToggleArchive}
                />
              ) : (
                <EmptyState
                  onCreate={() => setIsModalOpen(true)}
                  onSeedDemoData={handleSeedDemoData}
                />
              )}
            </>
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
    </div>
  )
}

export default App
