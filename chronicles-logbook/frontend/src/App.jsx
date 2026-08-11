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

function SchemaBuilder({ project, onSave, disabled }) {
  const [fields, setFields] = useState(() => project.entry_schema || [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setFields(project.entry_schema || [])
    setError(null)
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
    const ids = new Set()
    const names = new Set()
    for (const field of fields) {
      if (!field.id.trim()) return "Every field needs an ID."
      if (!field.name.trim()) return "Every field needs a name."
      if (ids.has(field.id.trim())) return `Duplicate field ID: ${field.id}`
      if (names.has(field.name.trim())) return `Duplicate field name: ${field.name}`
      ids.add(field.id.trim())
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
    try {
      await onSave({ entry_schema: fields })
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
                  ID
                  <input
                    type="text"
                    value={field.id}
                    onChange={(e) => updateField(index, { id: e.target.value })}
                    placeholder="field-id"
                  />
                </label>
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
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={addField}>
          Add field
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={disabled || isSaving}
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
          <SchemaBuilder project={project} onSave={onSchemaSaved} />
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

  const handleCreateProject = async () => {
    const name = window.prompt("Project name:")
    if (!name || !name.trim()) return
    try {
      const project = await createProject({ name: name.trim(), entry_schema: [] })
      setProjects((prev) => [...prev, project])
      setSelectedId(project.id)
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
      <header className="topbar">
        <div className="brand">
          <div className="mark">C</div>
          <div>
            <div className="brand-name">Chronicles</div>
            <div className="brand-note">a logbook that fits how you work</div>
          </div>
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
          onSelect={setSelectedId}
          onCreate={handleCreateProject}
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
            <EmptyState onCreate={handleCreateProject} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
