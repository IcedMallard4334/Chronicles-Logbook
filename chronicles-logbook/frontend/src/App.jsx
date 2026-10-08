import { useNavigate } from "react-router-dom"
import { createMiraConversation, deleteMiraConversation, fetchMiraConversation, fetchMiraConversations, signOut, streamMiraReply } from "./api"
import { describeOutcome, pageToView, runActions } from "./miraActions"
import { EntriesPage, TasksPage } from "./WorkspacePages"
import {
  EntryBasics,
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
import ActivityHub from "./ActivityHub"
import CalendarView from "./CalendarView"
import BoardView from "./BoardView"
import OutstandingPage from "./OutstandingPage"
import StatisticsPage from "./StatisticsPage"
import ChronologicalTimeline from "./EntryTimeline"
import FieldTimeline from "./FieldTimeline"
import { MiraAssistantPage, MiraLauncher } from "./MiraAssistant"
import LogoIcon from "./ChroniclesLogo"
import DeletedEntries from "./DeletedEntries"
import { TaskPanel } from "./TaskPanel"
import OfflineStatus from "./OfflineStatus"
import Invitations from "./Invitations"
import Reminders from "./Reminders"
import Streaks from "./Streaks"
import AchievementCelebration from "./AchievementCelebration"
import EntryTaskGuide from "./EntryTaskGuide"
import { ActivityIcon, BoardIcon, OutstandingIcon, TodayIcon } from "./NavIcons"
import StatusEditor, { statusProblem } from "./StatusEditor"
import StatusPicker from "./StatusPicker"
import { hasCustomStatuses, projectStatuses } from "./statuses"
import "./StatusEditor.css"
import AutomationPanel from "./AutomationPanel"
import { ruleFillableFieldIds } from "./automationRules"
import { formatDuration } from "./formatDuration"
import AmbientBackground from "./AmbientBackground"
import ViewTransition, { ViewLoader } from "./ViewTransition"
import { useDialogFocus } from "./useDialogFocus"
import { PageHint, WelcomeTour } from "./GuidedTour"
import { PAGE_TOURS, PROJECT_TOURS, WELCOME_TOUR, seenTours } from "./tourSteps"
import DataTransfer from "./DataTransfer"
import { REJECTED, offlineQueue } from "./offlineQueue"
import { syncEngine } from "./offlineSync"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  archiveProject,
  createEntry,
  createProject,
  deleteAccount,
  deleteProject,
  fetchEntries,
  fetchProjectMembers,
  fetchProjects,
  fetchRules,
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
  CHECKLIST_LIMIT,
  FIELD_TYPE_META,
  FIELD_TYPES,
  TAGS_LIMIT,
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
// Last, so the small-screen rules win over every stylesheet above.
import "./Dropdowns.css"
import "./Motion.css"
import "./MobileLayout.css"
import { PencilIcon } from "./EditIcon"
import LearningLauncher from "./LearningLauncher"
import { timeSpentProblem } from "./timeSpent"
import Drawer from "./Drawer"
import FormField, { ShortTextBox } from "./FormField"
import { BUILT_IN_FIELDS, defaultSchemaFields, isBuiltInName, missingRequired, missingRequiredMessage } from "./formFields"
import { TrashButton } from "./TrashIcon"

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

  if (!user) return <a className="auth-link" href="/signin">Sign in</a>

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
  const navigate = useNavigate()

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
          <button type="button" className="btn-text empty-learning-link" onClick={() => navigate("/learning")}>
            New to digital logbooks? Explore Learning Chronicles →
          </button>
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



// The most a project's name and description can hold (the server enforces the same).
const PROJECT_NAME_MAX = 255
const PROJECT_DESCRIPTION_MAX = 4000

/** What is wrong with a project's name and description, as sentences, keyed by field. */
function projectFieldErrors(name, description) {
  const errors = {}
  const trimmedName = name.trim()
  if (!trimmedName) errors.name = "Give the project a name."
  else if (trimmedName.length > PROJECT_NAME_MAX) {
    errors.name = `A name can be at most ${PROJECT_NAME_MAX} characters. This one is ${trimmedName.length}.`
  }
  const trimmedDescription = description.trim()
  if (trimmedDescription.length > PROJECT_DESCRIPTION_MAX) {
    errors.description = `A description can be at most ${PROJECT_DESCRIPTION_MAX} characters. This one is ${trimmedDescription.length}.`
  }
  return errors
}

function CreateProjectModal({ isOpen, onClose, onCreate, projects = [] }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const draft = useSchemaDraft(() => defaultSchemaFields(generateId))
  const formId = useId()

  const reset = () => {
    setName("")
    setDescription("")
    setErrors({})
    setError(null)
    draft.setFields(defaultSchemaFields(generateId))
  }

  const handleCancel = () => {
    reset()
    onClose()
  }

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const found = projectFieldErrors(name, description)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setError(null)
      return
    }
    const problem = schemaProblem(draft.fields)
    if (problem) {
      setError(problem)
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || null,
        entry_schema: draft.fields.map((field) => cleanField(field, draft.fields)),
      })
      reset()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      title="Start a new project"
      subtitle="Name your logbook, then look over the form its entries will use."
      onClose={handleCancel}
      closeLabel="Close new project"
      busy={isSaving}
      className="project-drawer"
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <div className="form-fields">
          <FormField
            label="Project name"
            typeLabel="Short text"
            required
            size="short"
            error={errors.name}
            count={{ length: name.trim().length, max: PROJECT_NAME_MAX }}
          >
            {(controlProps) => (
              <ShortTextBox
                {...controlProps}
                value={name}
                onValueChange={(next) => { setName(next); if (errors.name) setErrors((current) => ({ ...current, name: undefined })) }}
                placeholder="e.g. Field Notes"
              />
            )}
          </FormField>
          <FormField
            label="Description (optional)"
            typeLabel="Long text"
            size="long"
            error={errors.description}
            count={{ length: description.trim().length, max: PROJECT_DESCRIPTION_MAX }}
          >
            {(controlProps) => (
              <textarea
                {...controlProps}
                value={description}
                onChange={(event) => { setDescription(event.target.value); if (errors.description) setErrors((current) => ({ ...current, description: undefined })) }}
                placeholder="What is this project for?"
                rows={4}
              />
            )}
          </FormField>
        </div>

        <section className="form-section" aria-labelledby={`${formId}-entry-form`}>
          <h3 className="form-section-title" id={`${formId}-entry-form`}>Entry form</h3>
          <p className="form-section-note">
            Every entry asks for a title and the time it took. A description and a date are added
            to start you off; change them, add more, or take them out.
          </p>
          <BuiltInFieldCards editing />
          <div className="field-list">
            {draft.fields.map((field, index) => (
              <SchemaFieldEditor
                key={field.id}
                field={field}
                index={index}
                schema={draft.fields}
                latestData={null}
                linkable={projects}
                onChange={draft.updateField}
                onRemove={draft.removeField}
              />
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn-secondary" onClick={draft.addField}>
              Add field
            </button>
          </div>
        </section>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions drawer-actions">
          <button type="button" className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" aria-label="Confirm create project" disabled={isSaving}>
            {isSaving ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </Drawer>
  )
}

function EditProjectModal({ isOpen, onClose, project, onSave }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [statuses, setStatuses] = useState(() => projectStatuses(null).map((item) => ({ ...item })))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (isOpen && project) {
      setName(project.name || "")
      setDescription(project.description || "")
      setStatuses(projectStatuses(project).map((item) => ({ ...item })))
      setError(null)
      setErrors({})
    }
  }, [isOpen, project])

  const handleCancel = () => {
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    const found = projectFieldErrors(name, description)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setError(null)
      return
    }
    const problem = statusProblem(statuses)
    if (problem) {
      setError(problem)
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await onSave({
        name: trimmed,
        description: description.trim() || null,
        statuses: statuses.map((item) => ({ name: item.name.trim(), done: item.done })),
      })
      onClose()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      title="Edit project"
      subtitle="Update the name, description and statuses for this logbook."
      onClose={handleCancel}
      closeLabel="Close edit project"
      busy={isSaving}
      className="project-drawer"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-fields">
          <FormField
            label="Project name"
            typeLabel="Short text"
            required
            size="short"
            error={errors.name}
            count={{ length: name.trim().length, max: PROJECT_NAME_MAX }}
          >
            {(controlProps) => (
              <ShortTextBox
                {...controlProps}
                value={name}
                onValueChange={(next) => { setName(next); if (errors.name) setErrors((current) => ({ ...current, name: undefined })) }}
                placeholder="e.g. Field Notes"
              />
            )}
          </FormField>
          <FormField
            label="Description (optional)"
            typeLabel="Long text"
            size="long"
            error={errors.description}
            count={{ length: description.trim().length, max: PROJECT_DESCRIPTION_MAX }}
          >
            {(controlProps) => (
              <textarea
                {...controlProps}
                value={description}
                onChange={(event) => { setDescription(event.target.value); if (errors.description) setErrors((current) => ({ ...current, description: undefined })) }}
                placeholder="What is this project for?"
                rows={4}
              />
            )}
          </FormField>
        </div>
        <StatusEditor statuses={statuses} onChange={setStatuses} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions drawer-actions">
          <button type="button" className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Drawer>
  )
}

/** The fields every entry has, greyed out: shown so it is clear they are there, but not editable. */
function BuiltInFieldCards({ editing = false }) {
  return (
    <div className="field-list built-in-fields" role="group" aria-label="Built-in fields">
      {BUILT_IN_FIELDS.map((field) => (
        <div key={field.key} className="field-card is-locked">
          {editing ? (
            <div className="field-row">
              <div className="field-label">
                <span>Name</span>
                <input type="text" value={field.name} disabled readOnly aria-label={`${field.name} (built-in field name)`} />
              </div>
              <div className="field-label">
                <span>Type</span>
                <select value={field.type} disabled aria-label={`${field.name} (built-in field type)`}>
                  <option value={field.type}>{field.typeLabel}</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="field-summary">
              <span className="field-summary-name">{field.name}</span>
              <span className="field-summary-type">{field.typeLabel}</span>
            </div>
          )}
          <p className="field-lock-note">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
              <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Built in. {field.note}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * The fields being edited, with the three things every schema editor needs: add one,
 * remove one, change one. Renaming a field renames it in every calculation that uses
 * it, so a calculation keeps naming a field that exists.
 */
function useSchemaDraft(initial) {
  const [fields, setFields] = useState(initial)

  const addField = () => {
    setFields((prev) => [...prev, { id: generateId(), name: "", type: "text", options: [], required: true }])
  }

  const removeField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const updateField = (index, patch) => {
    setFields((prev) => {
      const next = prev.map((field, i) => (i === index ? { ...field, ...patch } : field))
      if (patch.name !== undefined) {
        const oldName = (prev[index].name || "").trim()
        const newName = (patch.name || "").trim()
        if (oldName && newName && oldName !== newName) {
          return next.map((field) =>
            field.type === "computed"
              ? { ...field, expression: renameFieldInExpression(field.expression, oldName, newName) }
              : field
          )
        }
      }
      return next
    })
  }

  return { fields, setFields, addField, removeField, updateField }
}

/**
 * The same rules the server enforces, checked here so a mistake is pointed out beside
 * the field rather than after a failed save. `saved` is the schema as it stands now:
 * a field that already has a built-in field's name keeps it, but a new one may not.
 */
function schemaProblem(fields, saved = []) {
  const names = new Set()
  for (const field of fields) {
    const name = (field.name || "").trim()
    if (!name) return "Every field needs a name."
    if (names.has(name.toLowerCase())) return `Two fields are both called "${name}".`
    names.add(name.toLowerCase())

    const alreadyNamedSo = saved.some((old) => old.id === field.id && (old.name || "").trim().toLowerCase() === name.toLowerCase())
    if (isBuiltInName(name) && !alreadyNamedSo) {
      return `"${name}" is already built in to every entry, so choose another name.`
    }

    // A calculation refers to a field by its name, so a brace in a name
    // would be read as half a reference, the same line the server holds.
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

function ProjectList({
  projects, statistics, selectedId, onSelect, onCreate,
  onShowHome, homeActive, onShowTimeline, timelineActive,
  onShowToday, todayActive, onShowOutstanding, outstandingActive, onCollapse,
  sheetOpen, onSheetOpenChange,
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState("")
  // On a phone the navigation is a bar along the bottom, and the project list
  // opens upwards from it; on a wide screen this changes nothing.
  // The phone's bottom bar (MobileTabBar) can open the sheet too, so App may
  // own this state; without those props the panel keeps its own.
  const [ownProjectsOpen, setOwnProjectsOpen] = useState(false)
  const projectsOpen = sheetOpen ?? ownProjectsOpen
  const setProjectsOpen = (next) => {
    const value = typeof next === "function" ? next(projectsOpen) : next
    if (onSheetOpenChange) onSheetOpenChange(value)
    else setOwnProjectsOpen(value)
  }
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
    <aside className={`sidebar workspace-sidebar${projectsOpen ? " is-projects-open" : ""}`} aria-label="Workspace navigation">
      <div className="workspace-sidebar-brand">
        <span className="workspace-sidebar-mark" aria-hidden="true">C</span>
        <div><strong>Workspace</strong><span>Projects and activity</span></div>
        {onCollapse && (
          <button type="button" className="btn-icon panel-collapse" aria-label="Hide the project panel" title="Hide the project panel" onClick={onCollapse}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18" /></svg>
          </button>
        )}
      </div>
      <nav className="workspace-sidebar-nav" aria-label="Workspace views">
        <button type="button" className={homeActive ? "is-active" : ""} aria-current={homeActive ? "page" : undefined} onClick={onShowHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
          Dashboard
        </button>
        <button type="button" className={timelineActive ? "is-active" : ""} aria-current={timelineActive ? "page" : undefined} onClick={onShowTimeline}>
          <ActivityIcon /> Activity
        </button>
        <button type="button" className={todayActive ? "is-active" : ""} aria-current={todayActive ? "page" : undefined} onClick={onShowToday}>
          <TodayIcon />
          Today
        </button>
        <button type="button" className={outstandingActive ? "is-active" : ""} aria-current={outstandingActive ? "page" : undefined} onClick={onShowOutstanding}>
          <OutstandingIcon />
          Outstanding
        </button>
        <button
          type="button"
          className={`sidebar-projects-toggle${projectsOpen ? " is-active" : ""}`}
          aria-expanded={projectsOpen}
          aria-controls="sidebar-projects"
          onClick={() => setProjectsOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          Projects
        </button>
      </nav>
      <div className="workspace-sidebar-stats" aria-label="Workspace summary">
        <span><strong>{activeProjects.length}</strong> Active Projects</span>
        <span><strong>{totals ? totals.entries : "–"}</strong> Logged Entries</span>
        <span><strong>{totals ? formatDuration(totals.time_spent) : "–"}</strong> Hours Logged</span>
        <span><strong>{totals ? totals.open_tasks ?? 0 : "–"}</strong> Open Tasks</span>
      </div>
      <div className="sidebar-head" id="sidebar-projects">
        <h2>Projects</h2>
        <button
          type="button"
          className="btn-icon"
          onClick={() => { setProjectsOpen(false); onCreate() }}
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
                    onClick={() => { setProjectsOpen(false); onSelect(project.id) }}
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
  // Required is the default, so only a field that is not required says so.
  if (field.required === false) cleaned.required = false
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
        {field.required === false && field.type !== "computed" && field.type !== "project_reference" && (
          <span className="field-summary-flag">Optional</span>
        )}
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
      {field.type !== "computed" && field.type !== "project_reference" && (
        <label className="field-required-toggle">
          <input
            type="checkbox"
            checked={field.required !== false}
            onChange={(event) => onChange(index, { required: event.target.checked })}
          />
          <span>Required</span>
          <small>A finished entry must fill this in. Planned work never has to.</small>
        </label>
      )}
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
      <TrashButton label="Remove field" onClick={() => onRemove(index)} />
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
  const { fields, setFields, addField, removeField, updateField } = useSchemaDraft(savedFields)
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
  }, [project.id, savedFields, setFields])

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

  const validateSchema = () => schemaProblem(fields, savedFields)

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
      <BuiltInFieldCards editing={isEditing} />
      {fields.length === 0 ? (
        <p className="hint">
          {isEditing ? "Nothing added on top yet. Add a field to ask for more." : "Nothing added on top of these yet."}
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
function richFieldProblem(schema, payload, ruleFillable = new Set()) {
  for (const field of schema) {
    const value = payload[field.id]
    if (field.type === "tags" && Array.isArray(value)) {
      // An empty tags field is fine when a rule may add tags to it (US-3.12);
      // if the rule turns out not to apply, the server says so.
      if (value.length === 0 && !ruleFillable.has(field.id)) return `"${field.name}" needs at least one tag.`
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
  const customStatuses = hasCustomStatuses(project)
  const finishedStatus = () => projectStatuses(project).find((item) => item.done)?.name
  const [status, setStatus] = useState(finishedStatus)
  const [dueDate, setDueDate] = useState("")
  const [dueTime, setDueTime] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  // US-3.12: the project's rules, so a field a rule can fill may be left
  // blank, and a note of which rules changed the entry just saved.
  const [rules, setRules] = useState([])
  const [ruleNotice, setRuleNotice] = useState(null)
  const ruleFillable = useMemo(() => ruleFillableFieldIds(rules), [rules])

  useEffect(() => {
    let active = true
    setRuleNotice(null)
    fetchRules(project.id)
      .then((loaded) => { if (active) setRules(Array.isArray(loaded) ? loaded : []) })
      // Rules only relax the form; without them it simply behaves as before.
      .catch(() => { if (active) setRules([]) })
    return () => { active = false }
  }, [project.id])

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
    setDueTime("")
    setError(null)
  }, [project.id])

  const handleChange = (fieldId, value) => {
    setData((prev) => ({ ...prev, [fieldId]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!title.trim()) {
      setError("Give this entry a title so it can be found again.")
      return
    }
    const missing = missingRequiredMessage(missingRequired(schema, data, { todo, ruleFillable }))
    if (missing) {
      setError(missing)
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
        // A tags field this entry does not need to fill in is left out when it has no tags.
        if (field.type === "tags" && (todo || field.required === false) && payload[field.id]?.length === 0) {
          delete payload[field.id]
        }
      }
      // Planned work may leave any field empty, so nothing is demanded of its tags either.
      const problem = richFieldProblem(schema, payload, todo ? new Set(schema.map((field) => field.id)) : ruleFillable)
      if (problem) {
        setError(problem)
        return
      }
      const timeProblem = timeSpentProblem(hoursSpent, minutesSpent)
      if (timeProblem) {
        setError(timeProblem)
        setIsSaving(false)
        return
      }
      const hours = hoursSpent === "" ? 0 : Number(hoursSpent)
      const minutes = minutesSpent === "" ? 0 : Number(minutesSpent)
      const timeSpent = hours * 60 + minutes
      setRuleNotice(null)
      const created = await onCreated({
        title: title.trim(),
        data: payload,
        time_spent: timeSpent === 0 ? null : timeSpent,
        todo,
        ...(customStatuses ? { status } : {}),
        // Sent as null rather than "" so the server reads it as "no deadline"
        // instead of rejecting an empty date.
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
      })
      const applied = created?.applied_rules || []
      if (applied.length > 0) {
        setRuleNotice(
          `Saved. ${applied.length === 1 ? "Rule" : "Rules"} applied: ${applied.map((rule) => rule.name).join(", ")}.`
        )
      }
      setTitle("")
      setData({})
      setHoursSpent("")
      setMinutesSpent("")
      setTodo(false)
      setStatus(finishedStatus())
      setDueDate("")
      setDueTime("")
    } catch (err) {
      setError(formatError(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className="panel-head">
        <h3>New entry</h3>
        <p>The fields marked * are needed to save it.</p>
      </div>
      <div className="form-fields">
        <EntryBasics
          title={title}
          onTitle={setTitle}
          hours={hoursSpent}
          onHours={setHoursSpent}
          minutes={minutesSpent}
          onMinutes={setMinutesSpent}
          hoursInvalid={Boolean(timeSpentProblem(hoursSpent, ""))}
          minutesInvalid={Boolean(timeSpentProblem("", minutesSpent))}
        />
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
            ruleCanFill={ruleFillable.has(field.id)}
            optional={todo}
          />
        ))}
      </div>
      {/* Logging something that has not happened yet: it is planned work, so it
          belongs in the outstanding view rather than the record of what was done. */}
      <section className="form-section entry-outstanding" aria-label="Progress">
        <h3 className="form-section-title">Progress</h3>
        {customStatuses ? (
          <StatusPicker
            project={project}
            value={status}
            onChange={(name, done) => {
              setStatus(name)
              setTodo(!done)
              if (done) { setDueDate(""); setDueTime("") }
            }}
          />
        ) : (
        <div className="checkbox-with-tip">
          <label className="field-label checkbox-label">
            <input
              type="checkbox"
              checked={todo}
              onChange={(e) => {
                setTodo(e.target.checked)
                if (!e.target.checked) { setDueDate(""); setDueTime("") }
              }}
            />
            This is still to do
          </label>
          <InfoTip text="Marks this as work you haven't finished yet, instead of a record of something already done. It'll show up on Outstanding and in Board's 'Still to do' column until you check it off." />
        </div>
        )}
        {todo && (
          <>
            <FormField label="Due date" typeLabel="Date" size="narrow">
              {(controlProps) => (
                <input {...controlProps} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              )}
            </FormField>
            <FormField label="Time of day (optional)" typeLabel="Time" size="narrow">
              {(controlProps) => (
                <input {...controlProps} type="time" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} />
              )}
            </FormField>
          </>
        )}
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      {ruleNotice && <p className="rule-applied-notice" role="status">{ruleNotice}</p>}
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
                      className={`log-field ${isNumericField(field) ? "is-numeric" : ""}${field.type === "long_text" ? " is-long" : ""}`}
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

function EntryTimeline({ projects }) {
  const [mode, setMode] = useState("entries")

  if (mode === "fields") {
    return <FieldTimeline projects={projects} onShowEntryTimeline={() => setMode("entries")} />
  }

  return <ChronologicalTimeline projects={projects} onShowFieldTrends={() => setMode("fields")} />
}

const TAB_BAR_ICONS = {
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  entries: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></>,
  tasks: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  today: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><circle cx="12" cy="16" r="1.5" /></>,
  activities: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  outstanding: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  assistant: <path d="M12 3a7 7 0 0 0-7 7v3a4 4 0 0 0 4 4h1l2 3 2-3h1a4 4 0 0 0 4-4v-3a7 7 0 0 0-7-7Z" />,
  board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></>,
  statistics: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
}

/**
 * The phone's navigation away from the home views: one thumb-height bar with the
 * four places used most and a "More" sheet for the rest. Hidden on wide screens,
 * where the top bar carries every destination.
 */
function MobileTabBar({ currentView, activeTab, onGo, projectsOpen = false, onProjects }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const main = [["home", "Home"], ["projects", "Projects"], ["entries", "Entries"], ["calendar", "Calendar"]]
  const more = [["today", "Today"], ["activities", "Activity"], ["outstanding", "Outstanding"], ["tasks", "Tasks"], ["board", "Board"], ["statistics", "Statistics"], ["assistant", "Mira"]]
  const current = activeTab || currentView
  const inMore = more.some(([view]) => view === current)
  const icon = (name) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TAB_BAR_ICONS[name]}</svg>
  return (
    <nav className={`mobile-tab-bar${moreOpen ? " is-more-open" : ""}`} aria-label="Quick navigation">
      {moreOpen && (
        <div className="mobile-tab-more" id="mobile-tab-more">
          {more.map(([view, label]) => (
            <button key={view} type="button" className={current === view ? "is-active" : ""} aria-current={current === view ? "page" : undefined} onClick={() => { setMoreOpen(false); onGo(view) }}>
              {icon(view)}
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="mobile-tab-row">
        {main.map(([view, label]) => view === "projects" ? (
          <button key={view} type="button" className={projectsOpen ? "is-active" : ""} aria-expanded={projectsOpen} aria-controls="sidebar-projects" onClick={() => { setMoreOpen(false); onProjects?.() }}>
            {icon(view)}
            {label}
          </button>
        ) : (
          <button key={view} type="button" className={!projectsOpen && current === view ? "is-active" : ""} aria-current={current === view ? "page" : undefined} onClick={() => { setMoreOpen(false); onGo(view) }}>
            {icon(view)}
            {label}
          </button>
        ))}
        <button type="button" className={moreOpen || inMore ? "is-active" : ""} aria-expanded={moreOpen} aria-controls="mobile-tab-more" onClick={() => setMoreOpen((open) => !open)}>
          {icon("more")}
          More
        </button>
      </div>
    </nav>
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
  onEntryRestored,
  onEditProject,
  onToggleArchive,
  onDeleteProject,
  onOpenProject,
  onLeaveProject,
  hintsSuppressed = false,
}) {
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [tab, setTab] = useState("entries")
  const [leaving, setLeaving] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)
  const [savedNotice, setSavedNotice] = useState(null)
  const [sharing, setSharing] = useState(false)
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
        <div className="detail-title-block">
          <div className="project-title-row">
            <h2>{project.name}</h2>
            {project.archived && <span className="status-badge archived-badge">Archived</span>}
            <button
              type="button"
              className="btn-icon btn-edit"
              onClick={onEditProject}
              aria-label="Edit project"
              title="Edit project"
            >
              <PencilIcon size={16} />
            </button>
          </div>
          {project.description && (
            <div className="detail-description-wrap">
              <p className={`detail-description${descriptionOpen ? " is-open" : ""}`}>{project.description}</p>
              {project.description.length > 90 && (
                <button type="button" className="btn-text detail-description-toggle" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen((open) => !open)}>
                  {descriptionOpen ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
          <p className="detail-meta">
            {/* The field count sits exactly where someone is looking at
                field-related content, so it doubles as a way to reach the
                schema rather than waiting to be found in the tab bar. */}
            <button type="button" className="meta-pill" onClick={() => setTab("schema")}>
              {project.entry_schema?.length || 0}{" "}
              {project.entry_schema?.length === 1 ? "field" : "fields"} · Schema
            </button>
          </p>
          {!project.shared && (
            <div className="detail-actions" role="group" aria-label="Project actions">
              <button type="button" className="btn-secondary detail-share-btn" onClick={() => setSharing(true)}>
                Share this project
              </button>
              <button type="button" className="btn-secondary detail-archive-btn" onClick={onToggleArchive}>
                {project.archived ? "Unarchive project" : "Archive project"}
              </button>
              <DeleteProjectControl project={project} onDeleted={onDeleteProject} />
            </div>
          )}
        </div>
        <div className="tab-switch" role="tablist" aria-label="Project tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "entries"}
            className={tab === "entries" ? "active" : ""}
            title="Entries: a record of work you have already done"
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
            title="Tasks: things you still need to do"
            onClick={() => setTab("tasks")}
          >
            Tasks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "automation"}
            className={tab === "automation" ? "active" : ""}
            onClick={() => setTab("automation")}
          >
            Automation
          </button>
        </div>
      </header>
      <div className="detail-body">
        {tab === "entries" ? (
          <>
            <div className="entries-toolbar">
              <h3>Past entries</h3>
              <EntryTaskGuide />
              {!project.archived && (
                <button
                  type="button"
                  className="btn-primary entry-add-toggle"
                  aria-expanded={addingEntry || (project.entries || []).length === 0}
                  aria-controls="new-entry-form"
                  aria-label={addingEntry ? "Close the new entry form" : "Add a new entry"}
                  title={addingEntry ? "Close" : "Add a new entry"}
                  onClick={() => { setSavedNotice(null); setAddingEntry((open) => !open) }}
                  disabled={(project.entries || []).length === 0}
                >
                  <span aria-hidden="true">{addingEntry ? "× Close" : "+ Log entry"}</span>
                </button>
              )}
            </div>
            {savedNotice && <p className="rule-applied-notice" role="status">{savedNotice}</p>}
            {project.archived ? (
              <div className="hint-card" role="status">
                <p>This project is archived. Unarchive it to add new entries.</p>
              </div>
            ) : (addingEntry || (project.entries || []).length === 0) && (
              <div id="new-entry-form">
                <EntryForm
                  project={project}
                  projects={projects}
                  entries={project.entries || []}
                  onCreated={async (payload) => {
                    const result = await onEntryCreated(payload)
                    const applied = result?.applied_rules || []
                    setSavedNotice(
                      applied.length > 0
                        ? `Saved. ${applied.length === 1 ? "Rule" : "Rules"} applied: ${applied.map((rule) => rule.name).join(", ")}.`
                        : "Entry saved."
                    )
                    setAddingEntry(false)
                    return result
                  }}
                  onOpenProject={onOpenProject}
                />
              </div>
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
            <DeletedEntries
              project={project}
              liveCount={(project.entries || []).length}
              userId={userId}
              onRestored={onEntryRestored}
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
        ) : tab === "tasks" ? (
          <TaskPanel
            projectId={project.id}
            onLogEntry={() => { setTab("entries"); setAddingEntry(true); setSavedNotice(null) }}
          />
        ) : tab === "automation" ? (
          <AutomationPanel project={project} />
        ) : null}
      </div>
      {sharing && <ShareProjectDialog projectId={project.id} projectName={project.name} onClose={() => setSharing(false)} />}
      {project.shared && <footer className="detail-footer">
        {(
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
        )}
      </footer>}
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
      <TrashButton
        className="detail-delete-btn"
        label="Delete project"
        text="Delete project"
        onClick={() => {
          setConfirming(true)
          setTyped("")
          setError("")
        }}
      />
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

function ShareProjectDialog({ projectId, projectName, onClose }) {
  const dialogRef = useDialogFocus(true, onClose)
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card share-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        tabIndex={-1}
      >
        <h2 id="share-dialog-title">Share {projectName}</h2>
        <ShareProjectPanel projectId={projectId} />
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
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
  const [miraActions, setMiraActions] = useState([])
  const [miraActionsRunning, setMiraActionsRunning] = useState(false)
  const [miraAutoRun, setMiraAutoRun] = useState(() => window.localStorage.getItem("chronicles-mira-auto-run") === "on")
  const appNavigate = useNavigate()
  const [miraOpen, setMiraOpen] = useState(false)
  const [miraConversationId, setMiraConversationId] = useState(null)
  const [miraConversations, setMiraConversations] = useState([])
  const miraSequence = useRef(0)
  const miraRunningRef = useRef(false)
  // On a phone the seven tabs can be folded away, leaving just the logo and the
  // controls on the right. Remembered, and ignored on wide screens.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    // A phone starts with the tabs folded away (the bottom bar is its navigation);
    // anyone who has chosen either way keeps their choice.
    try {
      const saved = window.localStorage.getItem("chronicles-nav-collapsed")
      if (saved !== null) return saved === "1"
    } catch { /* private mode */ }
    return Boolean(window.matchMedia?.("(max-width: 720px)").matches)
  })
  const toggleNav = () => setNavCollapsed((collapsed) => {
    try { window.localStorage.setItem("chronicles-nav-collapsed", collapsed ? "0" : "1") } catch { /* private mode */ }
    return !collapsed
  })
  // The project panel beside Home can be folded away so a dashboard has the whole width.
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try { return window.localStorage.getItem("chronicles-panel-collapsed") === "1" } catch { return false }
  })
  const togglePanel = () => setPanelCollapsed((collapsed) => {
    try { window.localStorage.setItem("chronicles-panel-collapsed", collapsed ? "0" : "1") } catch { /* private mode */ }
    return !collapsed
  })
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const validViews = ["home", "today", "assistant", "entries", "tasks", "board", "outstanding", "calendar", "statistics", "activities"]
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

  const showWorkspaceSidebar = ["home", "today", "outstanding", "activities"].includes(currentView)
  // Phone only: the project sheet that opens from the bottom bar's Projects tab.
  const [projectsSheetOpen, setProjectsSheetOpen] = useState(false)

  // US-3.23: a one-time welcome tour, then a single coach mark the first
  // time each page is opened. Both read seenTours() fresh on every render
  // rather than caching "have I shown this" in state — the tick counters
  // below exist only to force that re-read once a tour marks itself seen,
  // since the dismissal itself lives in localStorage, not component state.
  const [, setWelcomeTick] = useState(0)
  const [, setHintTick] = useState(0)
  const showWelcome = !loading && !seenTours().includes(WELCOME_TOUR.id)
  const pageKey = currentView === "home" && view === "timeline" ? "timeline" : currentView
  const pageTour = PAGE_TOURS[pageKey]
  const showPageHint =
    !loading && !showWelcome && pageTour && !seenTours().includes(pageTour.id)

  const refreshMiraConversations = useCallback(async () => {
    try {
      setMiraConversations(await fetchMiraConversations())
    } catch {
      // History is a convenience; a failed refresh must not interrupt the chat.
    }
  }, [])

  // Runs what Mira proposed, now that it has been confirmed (or is safe to run
  // straight away), and reports in the chat how it went.
  const runMiraActions = useCallback(async (actions) => {
    if (miraRunningRef.current || !actions.length) return
    miraRunningRef.current = true
    setMiraActionsRunning(true)
    setMiraError(null)
    try {
      const outcome = await runActions(actions, {
        navigate: (page) => {
          const target = pageToView(page)
          if (target) setCurrentView(target)
          else appNavigate(`/${page}`)
        },
      })
      setMiraMessages(previous => [...previous, { id: `mira-outcome-${Date.now()}`, role: "assistant", content: describeOutcome(outcome) }])
      setMiraActions([])
      try {
        setProjects(await fetchProjects())
      } catch {
        // The chat already says what happened; the list catches up on the next load.
      }
    } finally {
      miraRunningRef.current = false
      setMiraActionsRunning(false)
    }
  }, [appNavigate])

  const sendMiraMessage = useCallback(async (message) => {
    const trimmed = message.trim()
    if (!trimmed || miraSending) return
    const id = ++miraSequence.current
    const replyId = `mira-${id}`
    const upsertReply = (change) => setMiraMessages(previous => previous.some(item => item.id === replyId)
      ? previous.map(item => item.id === replyId ? change(item) : item)
      : [...previous, change({ id: replyId, role: "assistant", content: "", thinking: "", streaming: true })])
    setMiraMessages(previous => [...previous, { id: `user-${id}`, role: "user", content: trimmed }])
    setMiraSending(true)
    setMiraError(null)
    try {
      let conversationId = miraConversationId
      if (!conversationId) {
        conversationId = (await createMiraConversation()).id
        setMiraConversationId(conversationId)
      }
      let failure = null
      const proposed = []
      await streamMiraReply(conversationId, trimmed, (event) => {
        if (event.type === "thought") upsertReply(item => ({ ...item, thinking: `${item.thinking}${event.text}` }))
        else if (event.type === "delta") upsertReply(item => ({ ...item, content: `${item.content}${event.text}` }))
        else if (event.type === "action") {
          proposed.push(event.action)
          setMiraActions(previous => [...previous, event.action])
        } else if (event.type === "error") failure = event.detail || "Mira could not reply just now. Please try again."
      })
      if (failure) throw new Error(failure)
      if (proposed.length) {
        const list = proposed.map(action => `- ${action.summary}`).join("\n")
        upsertReply(item => ({ ...item, content: `${item.content}\n\n**Proposed for your approval:**\n${list}` }))
      }
      upsertReply(item => ({ ...item, streaming: false }))
      // Quick path: when the person has opted in, anything that only adds or changes runs at once.
      if (proposed.length && miraAutoRun && !proposed.some(action => action.destructive)) runMiraActions(proposed)
    } catch (error) {
      // The failed exchange leaves nothing behind — the question is dropped with
      // the reply it never got, so a retry cannot duplicate it — and whatever the
      // backend said about the failure is what the person reads.
      setMiraMessages(previous => previous.filter(item => item.id !== replyId && item.id !== `user-${id}`))
      setMiraError({ message: error?.message || "Mira could not reply just now. Please try again.", retryMessage: trimmed })
    } finally {
      setMiraMessages(previous => previous.map(item => item.id === replyId ? { ...item, streaming: false } : item))
      setMiraSending(false)
      refreshMiraConversations()
    }
  }, [miraSending, miraConversationId, refreshMiraConversations, miraAutoRun, runMiraActions])

  const startNewMiraConversation = useCallback(() => {
    setMiraConversationId(null)
    setMiraMessages([])
    setMiraError(null)
    setMiraActions([])
  }, [])

  const openMiraConversation = useCallback(async (conversationId) => {
    if (miraSending) return
    try {
      const conversation = await fetchMiraConversation(conversationId)
      setMiraConversationId(conversation.id)
      setMiraMessages(conversation.messages.map(item => ({ id: item.id, role: item.role, content: item.content, thinking: item.thinking || "" })))
      setMiraError(null)
      setMiraActions([])
    } catch {
      setMiraError({ message: "That conversation could not be opened.", retryMessage: null })
    }
  }, [miraSending])

  const removeMiraConversation = useCallback(async (conversationId) => {
    try {
      await deleteMiraConversation(conversationId)
      if (conversationId === miraConversationId) startNewMiraConversation()
      await refreshMiraConversations()
    } catch {
      setMiraError({ message: "That conversation could not be deleted.", retryMessage: null })
    }
  }, [miraConversationId, refreshMiraConversations, startNewMiraConversation])

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

  const openMiraProject = useCallback((projectId) => {
    setView("project")
    setSelectedId(projectId)
    setCurrentView("home")
  }, [])

  const miraConversation = {
    messages: miraMessages,
    sending: miraSending,
    error: miraError,
    pendingActions: miraActions,
    actionsRunning: miraActionsRunning,
    autoRun: miraAutoRun,
    onToggleAutoRun: (on) => {
      setMiraAutoRun(on)
      window.localStorage.setItem("chronicles-mira-auto-run", on ? "on" : "off")
    },
    onSend: sendMiraMessage,
    onRunActions: () => runMiraActions(miraActions),
    onCancelActions: () => { setMiraActions([]); setMiraError(null) },
    onOpenProject: openMiraProject,
    onClear: startNewMiraConversation,
    conversations: miraConversations,
    activeConversationId: miraConversationId,
    onSelectConversation: openMiraConversation,
    onNewConversation: startNewMiraConversation,
    onDeleteConversation: removeMiraConversation,
  }

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (miraOpen || currentView === "assistant") refreshMiraConversations()
  }, [miraOpen, currentView, refreshMiraConversations])


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


  // Throws on failure so the new-project drawer can say what went wrong beside the form.
  const handleCreateProject = async ({ name, description, entry_schema }) => {
    const project = await createProject({ name, description, entry_schema })
    setProjects((prev) => [...prev, project])
    setView("project")
    setSelectedId(project.id)
    setIsModalOpen(false)
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
      // Returned so the form can say which rules (US-3.12) changed it.
      return entry
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
          dueTime: payload.due_time ?? null,
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

  // A restored entry (US-3.10) goes back where its capture time puts it.
  const handleEntryRestored = (restored) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === restored.project_id
          ? {
              ...project,
              entries: [...(project.entries || []).filter((entry) => entry.id !== restored.id), restored].sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at)
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
        <nav className={`nav-pill${navCollapsed ? " is-collapsed" : ""}`} aria-label="Main navigation">
          <div className="nav-flow" aria-hidden="true"><svg viewBox="0 0 1400 70" preserveAspectRatio="none"><path d="M-100 55 C180 -20 330 100 600 35 S1000 0 1500 45" /><path d="M-100 15 C250 90 420 -25 740 40 S1100 80 1500 10" /><path d="M-100 60 C350 20 500 80 900 15 S1200 65 1500 35" /></svg></div>
          <div className="nav-pill-left">
            <LogoIcon size={30} />
            <span className="brand-name">Chronicles</span>
            <button
              type="button"
              className="nav-collapse-toggle"
              aria-expanded={!navCollapsed}
              aria-controls="main-nav-tabs"
              aria-label={navCollapsed ? "Show navigation tabs" : "Hide navigation tabs"}
              onClick={toggleNav}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points={navCollapsed ? "6 9 12 15 18 9" : "6 15 12 9 18 15"} /></svg>
            </button>
          </div>
          <div className="nav-pill-center" id="main-nav-tabs">
            <button
              type="button"
              className={`nav-item ${showWorkspaceSidebar ? "active" : ""}`}
              onClick={() => { setCurrentView("home"); setSelectedId(null); setView("project") }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Home</span>
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
              <BoardIcon />
              <span>Board</span>
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
            <button
              type="button"
              data-nav="statistics"
              className={`nav-item ${currentView === "statistics" ? "active" : ""}`}
              onClick={() => setCurrentView("statistics")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Statistics</span>
            </button>
          </div>
          <div className="nav-pill-right">
            <OfflineStatus userId={userId} projects={projects} />
            <Invitations onChanged={loadProjects} />
            <Streaks />
            <Reminders onOpenProject={handleSelectProject} onOccurrencesCreated={loadEntries} />
            <AuthActions />
          </div>
        </nav>
      </header>
      <main className={`app-main ${showWorkspaceSidebar ? "home-main" : "app-main-wide"}${showWorkspaceSidebar && panelCollapsed ? " is-panel-collapsed" : ""}`}>
        {showWorkspaceSidebar && panelCollapsed && (
          <button type="button" className="panel-expand" aria-label="Show the project panel" title="Show the project panel" onClick={togglePanel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
            <span>Projects</span>
          </button>
        )}
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
        {showWorkspaceSidebar && <div className="sidebar-stack">
          <ProjectList
            projects={projects}
            statistics={statistics}
            onCollapse={togglePanel}
            selectedId={currentView === "home" ? selectedId : null}
            onSelect={handleSelectProject}
            onCreate={() => setIsModalOpen(true)}
            onShowHome={() => { setCurrentView("home"); setSelectedId(null); setView("project") }}
            homeActive={currentView === "home" && view !== "timeline" && !selectedProject}
            onShowTimeline={handleShowTimeline}
            timelineActive={(currentView === "home" && view === "timeline") || currentView === "activities"}
            onShowToday={() => setCurrentView("today")}
            todayActive={currentView === "today"}
            onShowOutstanding={() => setCurrentView("outstanding")}
            outstandingActive={currentView === "outstanding"}
            sheetOpen={projectsSheetOpen}
            onSheetOpenChange={setProjectsSheetOpen}
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
              <CalendarView
                projects={projects}
                userId={userId}
                onEditProject={(id) => { setSelectedId(id); setIsEditModalOpen(true) }}
                renderProjectDelete={(project, done) => (
                  <DeleteProjectControl project={project} onDeleted={(id) => { handleDeleteProject(id); done() }} />
                )}
              />
            ) : currentView === "activities" ? (
              <ActivityHub logged={<EntryTimeline projects={projects} />} initialTab="scheduled" />
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
            ) : currentView === "statistics" ? (
              <StatisticsPage projects={projects} onNavigate={setCurrentView} />
            ) : currentView === "dashboard" ? (
              <HomeWorkspace projects={projects} onCreateProject={() => setIsModalOpen(true)} />
            ) : view === "timeline" ? (
              <ActivityHub logged={<EntryTimeline projects={projects} />} />
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
                onEntryRestored={handleEntryRestored}
                onEditProject={() => setIsEditModalOpen(true)}
                onToggleArchive={handleToggleArchive}
                onDeleteProject={handleDeleteProject}
                onOpenProject={handleSelectProject}
                onLeaveProject={handleLeaveProject}
                hintsSuppressed={showWelcome || showPageHint}
              />
            ) : projects.length > 0 ? (
              <HomeWorkspace projects={projects} onCreateProject={() => setIsModalOpen(true)} />
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
        projects={projects}
      />
      <EditProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        project={selectedProject}
        onSave={handleProjectUpdate}
      />
      <AchievementCelebration />
      <CommandPalette projects={projects} onNavigate={setCurrentView} onOpenProject={handleSelectProject} onCreateProject={() => setIsModalOpen(true)} />
      {showWelcome && (
        <WelcomeTour tour={WELCOME_TOUR} onFinish={() => setWelcomeTick((tick) => tick + 1)} />
      )}
      {showPageHint && (
        <PageHint hint={pageTour} onDismiss={() => setHintTick((tick) => tick + 1)} />
      )}
      {/* One bottom bar on every page (shown by MobileLayout.css below 720px only). */}
      <MobileTabBar
        currentView={currentView}
        activeTab={currentView === "home" && view === "timeline" ? "activities" : currentView}
        projectsOpen={projectsSheetOpen}
        onProjects={() => {
          if (projectsSheetOpen) { setProjectsSheetOpen(false); return }
          // The project list lives in the Home panel, so bring Home's panel up first.
          if (!showWorkspaceSidebar) setCurrentView("home")
          setProjectsSheetOpen(true)
        }}
        onGo={(view) => {
          setProjectsSheetOpen(false)
          if (view === "home") { setCurrentView("home"); setSelectedId(null); setView("project") }
          else if (view === "activities") handleShowTimeline()
          else setCurrentView(view)
        }}
      />
      {currentView === "home" && !selectedProject && <LearningLauncher />}
      {currentView !== "assistant" && <MiraLauncher conversation={miraConversation} open={miraOpen} onToggle={() => setMiraOpen(value => !value)} onOpenFull={() => { setMiraOpen(false); setCurrentView("assistant") }} />}
    </div>
  )
}

export default App
