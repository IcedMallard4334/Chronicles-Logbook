import { useCallback, useEffect, useState } from "react"
import {
  createTask,
  deleteTask,
  fetchTasks,
  toggleTask,
  updateTask,
} from "./api"
import { TrashButton } from "./TrashIcon"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function isOverdue(dateStr, completed) {
  if (!dateStr || completed) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + "T00:00:00") < today
}

// ── Task Form ────────────────────────────────────────────────────────

function generateChecklistId() {
  return `chk-${Math.random().toString(36).slice(2, 9)}`
}

export function TaskForm({ projectId, task, onSaved, onCancel }) {
  const [title, setTitle] = useState(task?.title || "")
  const [description, setDescription] = useState(task?.description || "")
  const [dueDate, setDueDate] = useState(task?.due_date || "")
  const [dueTime, setDueTime] = useState((task?.due_time || "").slice(0, 5))
  const [checklist, setChecklist] = useState(task?.checklist || [])
  const [newItemText, setNewItemText] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setTitle(task?.title || "")
    setDescription(task?.description || "")
    setDueDate(task?.due_date || "")
    setDueTime((task?.due_time || "").slice(0, 5))
    setChecklist(task?.checklist || [])
    setNewItemText("")
    setError(null)
  }, [task])

  const isEditing = !!task

  const handleAddChecklistItem = () => {
    const trimmed = newItemText.trim()
    if (!trimmed) return
    setChecklist((prev) => [...prev, { id: generateChecklistId(), text: trimmed, completed: false }])
    setNewItemText("")
  }

  const handleChecklistInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleAddChecklistItem()
    }
  }

  const handleRemoveChecklistItem = (id) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id))
  }

  const handleToggleChecklistItem = (id) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError("Task title can't be empty.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        title: trimmed,
        description: description.trim() || null,
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
        checklist: checklist.map((item) => ({
          id: item.id,
          text: item.text.trim(),
          completed: !!item.completed,
        })),
      }
      if (isEditing) {
        await updateTask(projectId, task.id, payload)
      } else {
        await createTask(projectId, payload)
      }
      setTitle("")
      setDescription("")
      setDueDate("")
      setDueTime("")
      setChecklist([])
      setNewItemText("")
      onSaved()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="panel-head">
        <h3>{isEditing ? "Edit task" : "Add a task"}</h3>
      </div>
      <div className="task-form-grid">
        <label className="field-label full">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
          />
        </label>
        <label className="field-label">
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className="field-label">
          Time of day (optional)
          <input
            type="time"
            value={dueTime}
            disabled={!dueDate}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </label>
        <label className="field-label full">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any details…"
            rows={2}
          />
        </label>
        <div className="field-label full task-checklist-edit">
          <span className="field-label-text">Checklist</span>
          {checklist.length > 0 && (
            <ul className="task-checklist-list" role="list">
              {checklist.map((item) => (
                <li key={item.id} className="task-checklist-item">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.completed}
                    className={`task-checkbox ${item.completed ? "checked" : ""}`}
                    onClick={() => handleToggleChecklistItem(item.id)}
                    aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                  >
                    {item.completed && (
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M3 8.5l3.5 3.5 6.5-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={`task-checklist-text ${item.completed ? "completed" : ""}`}>
                    {item.text}
                  </span>
                  <TrashButton
                    label="Remove checklist item"
                    onClick={() => handleRemoveChecklistItem(item.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="task-checklist-add">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={handleChecklistInputKeyDown}
              placeholder="Add a checkpoint…"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleAddChecklistItem}
              disabled={!newItemText.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {isEditing && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={isSaving}>
          {isSaving
            ? "Saving…"
            : isEditing
              ? "Save changes"
              : "Add task"}
        </button>
      </div>
    </form>
  )
}

// ── Task List ────────────────────────────────────────────────────────

function TaskProgress({ checklist }) {
  const total = checklist?.length || 0
  const done = checklist?.filter((item) => item.completed).length || 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="task-progress">
      <div className="task-progress-track" aria-hidden="true">
        <div className="task-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="task-progress-label">{done}/{total}</span>
    </div>
  )
}

function TaskItem({ projectId, task, onToggle, onEdit, onDelete, onRefresh }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingChecklist, setIsUpdatingChecklist] = useState(false)

  const handleToggle = async () => {
    try {
      await onToggle(projectId, task.id)
    } catch {
      // error surfaced via parent refresh
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    setIsDeleting(true)
    try {
      await onDelete(projectId, task.id)
    } catch {
      setIsDeleting(false)
    }
  }

  const handleToggleChecklistItem = async (itemId) => {
    if (!task.checklist || task.checklist.length === 0 || isUpdatingChecklist) return
    const updatedChecklist = task.checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    )
    setIsUpdatingChecklist(true)
    try {
      await updateTask(projectId, task.id, {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        due_time: task.due_time ? task.due_time.slice(0, 5) : null,
        completed: task.completed,
        checklist: updatedChecklist,
      })
      onRefresh()
    } catch {
      // error surfaced via parent refresh
    } finally {
      setIsUpdatingChecklist(false)
    }
  }

  if (isEditing) {
    return (
      <TaskForm
        projectId={projectId}
        task={task}
        onSaved={() => {
          setIsEditing(false)
          onRefresh()
        }}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  const overdue = isOverdue(task.due_date, task.completed)
  const hasChecklist = task.checklist && task.checklist.length > 0

  return (
    <li className={`task-item ${task.completed ? "completed" : ""} ${overdue ? "overdue" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        className={`task-checkbox ${task.completed ? "checked" : ""}`}
        onClick={handleToggle}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        title={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed && (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M3 8.5l3.5 3.5 6.5-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="task-content">
        <span className="task-title">{task.title}</span>
        {task.description && <span className="task-description">{task.description}</span>}
        {hasChecklist && <TaskProgress checklist={task.checklist} />}
        {hasChecklist && (
          <ul className="task-checklist-display" role="list">
            {task.checklist.map((item) => (
              <li key={item.id} className="task-checklist-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.completed}
                  className={`task-checkbox small ${item.completed ? "checked" : ""}`}
                  onClick={() => handleToggleChecklistItem(item.id)}
                  disabled={isUpdatingChecklist}
                  aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                >
                  {item.completed && (
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M3 8.5l3.5 3.5 6.5-8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`task-checklist-text ${item.completed ? "completed" : ""}`}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        {task.due_date && (
          <span className={`task-due ${overdue ? "task-overdue" : ""}`}>
            {overdue ? "Overdue · " : ""}
            {formatDate(task.due_date)}
            {task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ""}
          </span>
        )}
        {/* Only worth the line when someone is named: a logbook nobody shares
            would otherwise repeat its owner's name on every row. */}
        {(task.created_by_name || task.completed_by_name) && (
          <span className="task-attribution">
            {task.created_by_name && `Added by ${task.created_by_name}`}
            {task.created_by_name && task.completed_by_name && " · "}
            {task.completed_by_name && `Completed by ${task.completed_by_name}`}
          </span>
        )}
      </div>
      <div className="task-actions">
        <button
          type="button"
          className="btn-text"
          onClick={() => onEdit(task)}
          aria-label="Edit task"
        >
          Edit
        </button>
        <TrashButton
          label="Delete task"
          onClick={handleDelete}
          disabled={isDeleting}
        />
      </div>
    </li>
  )
}

// ── Task Panel (main export) ─────────────────────────────────────────

export function TaskPanel({ projectId, onLogEntry }) {
  const [finished, setFinished] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [filter, setFilter] = useState("all") // "all" | "open" | "done"

  const loadTasks = useCallback(async () => {
    try {
      const completedParam =
        filter === "open" ? false : filter === "done" ? true : undefined
      const data = await fetchTasks(projectId, completedParam)
      setTasks(data)
      setError(null)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, filter])

  useEffect(() => {
    setLoading(true)
    loadTasks()
  }, [loadTasks])

  const handleToggle = async (pid, taskId) => {
    const before = tasks.find((task) => task.id === taskId)
    await toggleTask(pid, taskId)
    // Finishing a task is the natural moment to record what was done, which is an entry.
    setFinished(before && !before.completed ? before.title : null)
    loadTasks()
  }

  const handleDelete = async (pid, taskId) => {
    await deleteTask(pid, taskId)
    loadTasks()
  }

  const handleEdit = (task) => {
    setEditingTask(task)
    setShowForm(false)
  }

  const handleSaved = () => {
    setShowForm(false)
    setEditingTask(null)
    loadTasks()
  }

  const openCount = tasks.filter((t) => !t.completed).length
  const doneCount = tasks.filter((t) => t.completed).length

  return (
    <div className="task-panel">
      <div className="task-panel-header">
        <div className="panel-head">
          <h3>Tasks</h3>
          <p>Track what needs to be done for this project.</p>
        </div>
        {!showForm && !editingTask && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm(true)
              setEditingTask(null)
            }}
          >
            Add task
          </button>
        )}
      </div>

      {finished && (
        <div className="task-finished-note" role="status">
          <span>Finished “{finished}”. Want a record of what you did? A task is a plan; an entry is the record.</span>
          {onLogEntry && <button type="button" className="btn-secondary" onClick={() => { setFinished(null); onLogEntry() }}>Log an entry</button>}
          <button type="button" className="btn-text" onClick={() => setFinished(null)}>Not now</button>
        </div>
      )}

      {showForm && !editingTask && (
        <TaskForm
          projectId={projectId}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingTask && (
        <TaskForm
          projectId={projectId}
          task={editingTask}
          onSaved={handleSaved}
          onCancel={() => setEditingTask(null)}
        />
      )}

      <div className="task-filters" role="tablist" aria-label="Task filters">
        {[
          { key: "all", label: `All (${openCount + doneCount})` },
          { key: "open", label: `Open (${openCount})` },
          { key: "done", label: `Done (${doneCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <p className="hint">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="hint">
          {filter === "all"
            ? "No tasks yet. Add one to get started."
            : filter === "open"
              ? "No open tasks."
              : "No completed tasks."}
        </p>
      ) : (
        <ul className="task-list" role="list">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              projectId={projectId}
              task={task}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRefresh={loadTasks}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
