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
