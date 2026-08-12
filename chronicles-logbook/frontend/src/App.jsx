import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createEntry,
  createProject,
  fetchEntries,
  fetchProjects,
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
    <svg
      className={className}
      viewBox="0 0 260 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Feet */}
      <ellipse cx="95" cy="250" rx="20" ry="12" fill="var(--text)" />
      <ellipse cx="165" cy="250" rx="20" ry="12" fill="var(--text)" />
      {/* Body */}
      <path
        d="M130 30
           C 180 30, 215 70, 215 130
           C 215 195, 185 245, 130 245
           C 75 245, 45 195, 45 130
           C 45 70, 80 30, 130 30Z"
        fill="var(--character)"
      />
      {/* Eyes */}
      <circle cx="108" cy="95" r="10" fill="var(--text)" />
      <circle cx="152" cy="95" r="10" fill="var(--text)" />
      <circle cx="110" cy="93" r="3" fill="var(--surface)" />
      <circle cx="154" cy="93" r="3" fill="var(--surface)" />
      {/* Mouth */}
      <path
        d="M124 118c3 4 9 4 12 0"
        stroke="var(--text)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Book held at the side */}
      <g transform="translate(22, 145) rotate(-18)">
        <rect
          x="0"
          y="0"
          width="78"
          height="58"
          rx="7"
          fill="var(--surface)"
          stroke="var(--character)"
          strokeWidth="3"
        />
        <line x1="39" y1="0" x2="39" y2="58" stroke="var(--character)" strokeWidth="2" />
        <line x1="8" y1="16" x2="36" y2="16" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="29" x2="36" y2="29" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
        <line x1="8" y1="42" x2="36" y2="42" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
        <line x1="42" y1="16" x2="70" y2="16" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
        <line x1="42" y1="29" x2="70" y2="29" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
        <line x1="42" y1="42" x2="70" y2="42" stroke="var(--character)" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
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

  if (!isOpen) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName("")
  }

  const handleCancel = () => {
    setName("")
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

function ProjectList({ projects, selectedId, onSelect, onCreate }) {
  return (
    <aside className="sidebar">
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
      {projects.length === 0 ? (
        <p className="sidebar-empty">No projects yet.</p>
      ) : (
        <ul className="project-list" role="listbox" aria-label="Projects">
          {projects.map((project) => (
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

function ProjectDetail({ project, onSchemaSaved, onEntryCreated }) {
  const [tab, setTab] = useState("entries")

  return (
    <section className="project-detail">
      <header className="detail-header">
        <div>
          <h2>{project.name}</h2>
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
            <EntryForm project={project} onCreated={onEntryCreated} />
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
    </section>
  )
}

function App() {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

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

  const handleCreateProject = async (name) => {
    try {
      const project = await createProject({ name, entry_schema: [] })
      setProjects((prev) => [...prev, project])
      setSelectedId(project.id)
      setIsModalOpen(false)
    } catch (err) {
      setError(formatError(err))
    }
  }

  const handleSchemaSaved = async (update) => {
    if (!selectedProject) return
    const updated = await updateProject(selectedProject.id, {
      name: selectedProject.name,
      ...update,
    })
    setProjects((prev) =>
      prev.map((project) => (project.id === updated.id ? updated : project))
    )
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
        <ThemeToggle />
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
          onSelect={setSelectedId}
          onCreate={() => setIsModalOpen(true)}
        />
        <div className="content">
          {loading ? (
            <p className="hint">Loading…</p>
          ) : selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              onSchemaSaved={handleSchemaSaved}
              onEntryCreated={handleEntryCreated}
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
    </div>
  )
}

export default App
