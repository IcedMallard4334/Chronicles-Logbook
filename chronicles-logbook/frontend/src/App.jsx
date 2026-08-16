import { useCallback, useEffect, useMemo, useState } from "react"
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

const FIELD_TYPES = ["text", "number", "date", "dropdown"]

function generateId() {
  return `field-${Math.random().toString(36).slice(2, 9)}`
}

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

const THEMES = ["light", "dark", "system"]

function ThemeToggle() {
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

  const icons = {
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
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleTheme}
      aria-label={`Theme: ${theme}. Click to cycle.`}
      title={`Theme: ${theme}`}
    >
      {icons[theme]}
      <span className="theme-label">{theme}</span>
    </button>
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

  const clearSession = () => {
    window.localStorage.removeItem("chronicles_token")
    window.localStorage.removeItem("chronicles_user")
    setUser(null)
  }

  const handleDelete = async () => {
    if (!window.confirm("Delete your Chronicles account? This cannot be undone.")) return
    setAccountError("")
    try {
      await deleteAccount()
      clearSession()
    } catch (error) {
      setAccountError(formatError(error))
    }
  }

  if (!user) return <a className="auth-link" href="/signin">Sign in</a>

  return (
    <div className="account-actions">
      <span className="account-name">{user.full_name}</span>
      <button type="button" className="auth-link" onClick={clearSession}>Sign out</button>
      <button type="button" className="delete-account" onClick={handleDelete}>Delete account</button>
      {accountError && <span className="account-error" role="alert">{accountError}</span>}
    </div>
  )
}

function Sparkle({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 0L18.5 13.5L32 16L18.5 18.5L16 32L13.5 18.5L0 16L13.5 13.5L16 0Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Planet({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="28" fill="var(--blue-soft)" stroke="var(--blue)" strokeWidth="2" />
      <path
        d="M28 60c0-20 14-34 32-34s32 14 32 34-14 34-32 34"
        stroke="var(--blue)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="60" cy="60" r="5" fill="var(--character)" />
    </svg>
  )
}

function Mascot({ className }) {
  return (
    <div className={`character ${className || ""}`} aria-label="Logbook character">
      <div className="character-head">
        <span className="eye eye-left" />
        <span className="eye eye-right" />
      </div>
      <div className="character-body" />
      <div className="leg leg-left" />
      <div className="leg leg-right" />
      <div className="book">
        <span className="book-seam" />
      </div>
    </div>
  )
}

function BackgroundDecorations() {
  return (
    <div className="background-decorations" aria-hidden="true">
      <Mascot className="bg-mascot" />
      <Planet className="bg-planet" />
      <Sparkle className="bg-sparkle sparkle-1" />
      <Sparkle className="bg-sparkle sparkle-2" />
      <Sparkle className="bg-sparkle sparkle-3" />
      <div className="bg-dot dot-1" />
      <div className="bg-dot dot-2" />
      <div className="bg-dot dot-3" />
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="empty-state">
      <h2>Welcome to Chronicles</h2>
      <p>Create your first project to start building a custom logbook.</p>
      <button type="button" className="btn-primary" onClick={onCreate}>
        Create project
      </button>
    </div>
  )
}

function Character({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="55" fill="var(--mauve-soft)" />
      <circle cx="60" cy="60" r="48" fill="var(--surface-mauve)" />
      <circle cx="42" cy="50" r="10" fill="var(--text)" />
      <circle cx="78" cy="50" r="10" fill="var(--text)" />
      <circle cx="45" cy="47" r="3" fill="var(--surface)" />
      <circle cx="81" cy="47" r="3" fill="var(--surface)" />
      <path
        d="M48 72c6 8 18 8 24 0"
        stroke="var(--text)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="22" cy="60" r="8" fill="var(--blue-soft)" />
      <circle cx="98" cy="60" r="8" fill="var(--blue-soft)" />
    </svg>
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
        <Character className="modal-character" />
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
        <Character className="modal-character" />
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
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData({})
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
      const payload = { ...data }
      for (const field of schema) {
        if (field.type === "number" && payload[field.id] !== undefined) {
          payload[field.id] = Number(payload[field.id])
        }
      }
      await onCreated(payload)
      setData({})
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchEntriesGlobal({ q, projectId })
        if (!cancelled) setEntries(data)
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
  }, [q, projectId])

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
        <ul className="timeline-list" role="list">
          {entries.map((entry) => (
            <li key={entry.id} className="timeline-row">
              <div className="timeline-meta">
                <span className="timeline-project">{entry.project_name}</span>
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
                    <span className="timeline-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
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
        ) : (
          <SchemaBuilder
            project={project}
            onSave={onSchemaSaved}
            onSwitchToEntries={() => setTab("entries")}
          />
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

function App() {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState("project")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

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
  }

  const handleShowTimeline = () => {
    setView("timeline")
    setSelectedId(null)
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

  const handleEntryCreated = async (data) => {
    if (!selectedProject) return
    const entry = await createEntry(selectedProject.id, data)
    setProjects((prev) =>
      prev.map((project) =>
        project.id === selectedProject.id
          ? { ...project, entries: [entry, ...(project.entries || [])] }
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

  return (
    <div className="app-shell">
      <BackgroundDecorations />
      <header className="topbar">
        <div className="brand">
          <div className="mark">C</div>
          <div>
            <div className="brand-name">Chronicles</div>
            <div className="brand-note">a logbook that fits how you work</div>
          </div>
        </div>
        <div className="topbar-actions">
          <AuthActions />
          <ThemeToggle />
        </div>
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
        <ProjectList
          projects={projects}
          selectedId={selectedId}
          onSelect={handleSelectProject}
          onCreate={() => setIsModalOpen(true)}
          onShowTimeline={handleShowTimeline}
          timelineActive={view === "timeline"}
        />
        <div className="content">
          {loading ? (
            <p className="hint">Loading…</p>
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
            <EmptyState onCreate={() => setIsModalOpen(true)} />
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
