import { useCallback, useEffect, useMemo, useState } from "react"
import { offlineQueue as defaultQueue } from "./offlineQueue"
import { syncEngine as defaultEngine } from "./offlineSync"
import { EntryFieldInput } from "./EntryShared"
import { useDialogFocus } from "./useDialogFocus"
import "./offlineStatus.css"

/**
 * Which field a server refusal is about, read from its message ("Missing
 * required field: Hours", "Field 'Due' must be a date string"), so the review
 * panel can point at that field instead of leaving the person to work it out.
 */
export function problemFieldId(message, schema) {
  const text = String(message || "")
  if (!text) return null
  const match = schema.find(
    (field) => text.includes(`Missing required field: ${field.name}`) || text.includes(`Field '${field.name}'`)
  )
  return match ? match.id : null
}

function ReviewField({ field, value, onChange, problem, reason }) {
  const describedBy = problem ? `offline-problem-${field.id}` : undefined
  let control
  if (field.type === "date") {
    // The browser's own date picker, so nobody has to type a date format.
    control = <input type="date" value={value ?? ""} aria-invalid={problem || undefined} aria-describedby={describedBy} autoFocus={problem} onChange={(event) => onChange(field.id, event.target.value)} />
  } else if (field.type === "dropdown") {
    control = (
      <select value={value ?? ""} aria-invalid={problem || undefined} aria-describedby={describedBy} autoFocus={problem} onChange={(event) => onChange(field.id, event.target.value)}>
        <option value="">Select…</option>
        {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  } else if (["tags", "checklist", "link", "computed", "project_reference"].includes(field.type)) {
    return <EntryFieldInput field={field} value={value} projects={[]} onChange={onChange} />
  } else {
    control = <input type={field.type === "number" ? "number" : "text"} value={value ?? ""} aria-invalid={problem || undefined} aria-describedby={describedBy} autoFocus={problem} onChange={(event) => onChange(field.id, event.target.value)} />
  }
  return (
    <label className={`field-label ${problem ? "is-problem" : ""}`}>
      {field.name}
      {control}
      {problem && <span id={`offline-problem-${field.id}`} className="offline-field-reason">{reason}</span>}
    </label>
  )
}

/**
 * Connection state, how much work is waiting to sync, and what the server
 * refused (US-2.16).
 *
 * The review panel is the whole of AC3: an entry the server rejected is the
 * only copy of what the user typed, so it has to be shown and resolved
 * deliberately rather than disappearing.
 */
export default function OfflineStatus({
  userId,
  projects = [],
  queue = defaultQueue,
  engine = defaultEngine,
}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine !== false
  )
  const [counts, setCounts] = useState({ pending: 0, rejected: 0, isSyncing: false })
  const [isOpen, setIsOpen] = useState(false)
  const dialogRef = useDialogFocus(isOpen, () => setIsOpen(false))
  const [rejected, setRejected] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})
  const [confirmingDiscardId, setConfirmingDiscardId] = useState(null)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      setCounts(await engine.snapshot(userId))
      setRejected(await queue.rejected(userId))
    } catch {
      // Storage can be unavailable — private browsing, or an environment with
      // no IndexedDB. Nothing is queued in that case, so showing nothing is
      // the correct outcome rather than an error the user cannot act on.
    }
  }, [engine, queue, userId])

  useEffect(() => {
    refresh()
    return engine.subscribe(() => refresh())
  }, [engine, refresh])

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects]
  )

  const startEditing = (record) => {
    setEditingId(record.id)
    setDraft({ ...record.data })
    setConfirmingDiscardId(null)
  }

  const saveAndRetry = async (record) => {
    const project = projectsById[record.projectId]
    const payload = { ...draft }

    // Match the coercion the entry form does, so a number field does not
    // reach the server as a string and get refused a second time.
    for (const field of project?.entry_schema || []) {
      if (field.type === "number" && payload[field.id] !== undefined) {
        payload[field.id] = Number(payload[field.id])
      }
    }

    await queue.retry(record.id, { data: payload })
    setEditingId(null)
    await engine.drain(userId)
    await refresh()
  }

  const retryUnchanged = async (record) => {
    await queue.retry(record.id)
    await engine.drain(userId)
    await refresh()
  }

  const discard = async (record) => {
    await queue.remove(record.id)
    setConfirmingDiscardId(null)
    await refresh()
  }

  const hasWork = counts.pending > 0 || counts.rejected > 0

  // Offline, a refresh reloads the page from a network that isn't there and
  // the app may not come back; unsynced entries make that worth a second thought.
  useEffect(() => {
    if (isOnline && !hasWork) return undefined
    if (isOnline && counts.pending === 0) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [isOnline, hasWork, counts.pending])

  if (isOnline && !hasWork) return null

  // The pending count is shown while offline too. Being told only "Offline"
  // when three entries are banked up is the moment you most want the number.
  const waiting = counts.pending > 0 ? `${counts.pending} waiting` : null

  const label =
    counts.rejected > 0
      ? `${counts.rejected} need${counts.rejected === 1 ? "s" : ""} attention`
      : !isOnline
        ? ["Offline", waiting].filter(Boolean).join(" · ")
        : waiting || "Synced"

  return (
    <>
      <button
        type="button"
        className={`offline-pill ${!isOnline ? "is-offline" : ""} ${counts.rejected > 0 ? "is-attention" : ""}`}
        onClick={() => setIsOpen(true)}
        aria-label={`Sync status: ${label}`}
      >
        <span className="offline-dot" aria-hidden="true" />
        <span>{label}</span>
      </button>

      {!isOnline && (
        <p className="offline-refresh-warning" role="status">
          You&rsquo;re offline. Please don&rsquo;t refresh or close this page &mdash; your entries are saved on this
          device and will sync when you&rsquo;re back online.
        </p>
      )}

      {isOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            ref={dialogRef}
            className="modal-card offline-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-title"
            tabIndex={-1}
          >
            <h2 id="offline-title">Sync status</h2>

            <p className="offline-summary">
              {counts.pending > 0
                ? `${counts.pending} ${counts.pending === 1 ? "entry is" : "entries are"} saved on this device and waiting to sync.`
                : isOnline
                  ? "Everything that can sync has synced."
                  : "You are offline. Entries you capture will be saved on this device and sync when the connection returns."}
            </p>

            {rejected.length > 0 && (
              <div className="offline-rejected">
                <h3>Could not be saved</h3>
                <p className="hint">
                  These were captured on this device but the server refused
                  them. Nothing has been lost — decide what to do with each.
                </p>

                <ul className="offline-list" role="list">
                  {rejected.map((record) => {
                    const project = projectsById[record.projectId]
                    const schema = project?.entry_schema || []

                    return (
                      <li key={record.id} className="offline-item">
                        <div className="offline-item-head">
                          <strong>{project?.name || "Unknown project"}</strong>
                          <time dateTime={record.capturedAt}>
                            {new Date(record.capturedAt).toLocaleString()}
                          </time>
                        </div>

                        <p className="offline-reason" role="status">
                          {record.error}
                        </p>

                        {editingId === record.id ? (
                          <div className="offline-edit">
                            {schema.length === 0 ? (
                              <p className="hint">
                                This project no longer exists, so the entry
                                cannot be edited to fit it.
                              </p>
                            ) : (
                              schema.map((field) => (
                                <ReviewField
                                  key={field.id}
                                  field={field}
                                  value={draft[field.id]}
                                  problem={field.id === problemFieldId(record.error, schema)}
                                  reason={record.error}
                                  onChange={(fieldId, value) =>
                                    setDraft((previous) => ({ ...previous, [fieldId]: value }))
                                  }
                                />
                              ))
                            )}
                            <div className="offline-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => saveAndRetry(record)}
                                disabled={schema.length === 0}
                              >
                                Save and retry
                              </button>
                            </div>
                          </div>
                        ) : confirmingDiscardId === record.id ? (
                          <div className="offline-actions">
                            <span className="offline-confirm">
                              Discard permanently? This is the only copy.
                            </span>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setConfirmingDiscardId(null)}
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              className="btn-text-danger"
                              onClick={() => discard(record)}
                            >
                              Discard
                            </button>
                          </div>
                        ) : (
                          <>
                            <dl className="offline-values">
                              {[
                                ...schema
                                  .filter((field) => field.id in record.data || field.id === problemFieldId(record.error, schema))
                                  .map((field) => [field.id, field]),
                                ...Object.keys(record.data)
                                  .filter((fieldId) => !schema.some((item) => item.id === fieldId))
                                  .map((fieldId) => [fieldId, null]),
                              ].map(([fieldId, field]) => {
                                const value = record.data[fieldId]
                                const isProblem = field && field.id === problemFieldId(record.error, schema)
                                const empty = value === undefined || value === null || value === ""
                                return (
                                  <div key={fieldId} className={isProblem ? "is-problem" : undefined}>
                                    <dt>{field?.name || fieldId}</dt>
                                    <dd>
                                      {empty ? <em>Missing</em> : String(value)}
                                      {isProblem && <strong className="offline-field-flag"> · needs attention</strong>}
                                    </dd>
                                  </div>
                                )
                              })}
                            </dl>
                            <div className="offline-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => retryUnchanged(record)}
                              >
                                Retry
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => startEditing(record)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-text-danger"
                                onClick={() => setConfirmingDiscardId(record.id)}
                              >
                                Discard
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
              {isOnline && counts.pending > 0 && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => engine.drain(userId).then(refresh)}
                  disabled={counts.isSyncing}
                >
                  {counts.isSyncing ? "Syncing…" : "Sync now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
