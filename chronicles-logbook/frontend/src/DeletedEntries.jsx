import { useEffect, useState } from "react"

import { fetchDeletedEntries, fetchEntryHistory, revertEntry } from "./api"
import { entryPreview } from "./EntryShared"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

/**
 * A project's deleted entries (US-3.10). Deleting only adds a tombstone
 * version, so each can be restored: that reverts it to the version before
 * the deletion, and the deletion stays in its history.
 */
export default function DeletedEntries({ project, liveCount, userId, onRestored }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [restoringId, setRestoringId] = useState(null)

  // Refetched while open whenever the live list changes, so an entry deleted
  // from the list above shows up here without reopening.
  useEffect(() => {
    if (!open) return undefined
    let active = true
    setError(null)
    fetchDeletedEntries(project.id)
      .then((deleted) => { if (active) setItems(deleted) })
      .catch((err) => { if (active) setError(formatError(err)) })
    return () => { active = false }
  }, [open, project.id, liveCount])

  const canRestore = (entry) =>
    !project.archived && (!project.shared || (Boolean(userId) && entry.created_by === userId))

  const restore = async (entry) => {
    setRestoringId(entry.id)
    setError(null)
    try {
      const history = await fetchEntryHistory(project.id, entry.id)
      const before = history.find((version) => version.action !== "deleted")
      if (!before) throw new Error("There is no earlier version to restore.")
      const saved = await revertEntry(project.id, entry.id, { revision: before.revision })
      setItems((prev) => (prev || []).filter((item) => item.id !== entry.id))
      onRestored?.(saved)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <details className="deleted-entries" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Deleted entries</summary>
      {error && <p className="error" role="alert">{error}</p>}
      {open && items === null && !error && <p className="hint">Loading…</p>}
      {items?.length === 0 && <p className="hint">Nothing has been deleted from this project.</p>}
      {items?.length > 0 && (
        <ul>
          {items.map((entry) => (
            <li key={entry.id}>
              <span>
                {entryPreview(entry)}
                {entry.deleted_at && (
                  <> · deleted <time dateTime={entry.deleted_at}>{new Date(entry.deleted_at).toLocaleString()}</time></>
                )}
              </span>
              {canRestore(entry) && (
                <button type="button" className="btn-text" onClick={() => restore(entry)} disabled={restoringId === entry.id}>
                  {restoringId === entry.id ? "Restoring…" : "Restore"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
