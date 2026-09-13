/**
 * Header indicator for work captured offline (US-2.16).
 *
 * Silent when there is nothing waiting, so the ordinary online case is
 * uncluttered. It speaks up for the two states the user cannot otherwise
 * see: entries still queued on this device, and entries the server refused,
 * which only they can resolve.
 */

import { useEffect, useState } from "react"
import { offlineQueue } from "./offlineQueue"
import { syncEngine } from "./offlineSync"

export default function OfflineStatus({ userId, projects = [] }) {
  const [state, setState] = useState({ pending: 0, rejected: 0, isSyncing: false })
  const [expanded, setExpanded] = useState(false)
  const [rejectedRecords, setRejectedRecords] = useState([])

  // The browser's own connectivity flag is worth showing on its own: with an
  // empty queue and no network there is nothing to sync, but the user still
  // needs to know why nothing is loading.
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false
  )

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine !== false)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    let current = true
    const apply = (next) => {
      if (current) setState(next)
    }

    syncEngine.snapshot(userId).then(apply).catch(() => {})
    const unsubscribe = syncEngine.subscribe(apply)

    return () => {
      current = false
      unsubscribe()
    }
  }, [userId])

  // The reason a record was refused is held on the record, not in the
  // snapshot, so it is only read when the user opens the detail.
  useEffect(() => {
    if (!expanded || !userId) return
    offlineQueue
      .rejected(userId)
      .then(setRejectedRecords)
      .catch(() => setRejectedRecords([]))
  }, [expanded, userId, state.rejected])

  const projectName = (projectId) =>
    projects.find((project) => project.id === projectId)?.name || "a project"

  if (isOnline && state.pending === 0 && state.rejected === 0) return null

  const label = state.rejected
    ? `${state.rejected} entr${state.rejected === 1 ? "y" : "ies"} need attention`
    : state.pending
      ? `${state.pending} waiting to sync`
      : "Offline"

  return (
    <div className="offline-status">
      <button
        type="button"
        className={`offline-status-pill ${state.rejected ? "is-rejected" : ""}`}
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-label={`Sync status: ${label}`}
      >
        <span className="offline-status-dot" aria-hidden="true" />
        {state.isSyncing ? "Syncing…" : label}
      </button>
      {expanded && (
        <div className="offline-status-detail" role="status">
          {!isOnline && <p>No connection. Entries are saved on this device.</p>}
          {state.pending > 0 && (
            <p>
              {state.pending} entr{state.pending === 1 ? "y" : "ies"} queued.
              They send themselves once the connection returns.
            </p>
          )}
          {rejectedRecords.length > 0 && (
            <ul className="offline-status-rejected" role="list">
              {rejectedRecords.map((record) => (
                <li key={record.id}>
                  <strong>{projectName(record.projectId)}</strong>
                  <span>{record.error || "The server refused this entry."}</span>
                </li>
              ))}
            </ul>
          )}
          {isOnline && state.pending === 0 && state.rejected === 0 && (
            <p>Everything is synced.</p>
          )}
        </div>
      )}
    </div>
  )
}
import { useCallback, useEffect, useMemo, useState } from "react"
import { offlineQueue as defaultQueue } from "./offlineQueue"
import { syncEngine as defaultEngine } from "./offlineSync"
import "./offlineStatus.css"

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

      {isOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <div
            className="modal-card offline-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-title"
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
                                <label key={field.id} className="field-label">
                                  {field.name}
                                  <input
                                    type={field.type === "number" ? "number" : "text"}
                                    value={draft[field.id] ?? ""}
                                    onChange={(event) =>
                                      setDraft((previous) => ({
                                        ...previous,
                                        [field.id]: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
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
                              {Object.entries(record.data).map(([fieldId, value]) => {
                                const field = schema.find((item) => item.id === fieldId)
                                return (
                                  <div key={fieldId}>
                                    <dt>{field?.name || fieldId}</dt>
                                    <dd>{String(value)}</dd>
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
