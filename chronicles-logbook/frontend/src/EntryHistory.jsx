import { useState } from "react"

import { fetchEntryHistory, revertEntry } from "./api"
import { formatVersionDate, versionAsOf } from "./entryVersions"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}

const ACTION_LABELS = { created: "Created", edited: "Edited", deleted: "Deleted", reverted: "Reverted" }
const FIXED_LABELS = { title: "Title", time_spent: "Time spent", todo: "Status", due_date: "Due date", schema_version: "Schema" }

/** A changed key ("data.<field id>", "title", …) as the person reading it would name it. */
function changedLabel(key, schema) {
  if (key.startsWith("data.")) {
    const id = key.slice(5)
    return schema.find((field) => field.id === id)?.name || id
  }
  return FIXED_LABELS[key] || key
}

/**
 * Every version of an entry, what changed in each, the entry as it stood on
 * any date, and reverting to an earlier version (US-3.10). A revert never
 * removes anything: it adds a version matching the one chosen.
 */
export default function EntryHistory({ projectId, entryId, canRevert, formatValue, onReverted }) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [asOfDate, setAsOfDate] = useState("")
  const [asOfMessage, setAsOfMessage] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [reason, setReason] = useState("")
  const [reverting, setReverting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setHistory(await fetchEntryHistory(projectId, entryId))
    } catch (err) {
      setError(formatError(err))
    } finally {
      setLoading(false)
    }
  }

  const current = history?.[0]

  const showAsOf = (isoDate) => {
    setAsOfDate(isoDate)
    setAsOfMessage(null)
    setConfirming(null)
    if (!isoDate || !history) return setViewing(null)
    const version = versionAsOf(history, isoDate)
    const label = formatVersionDate(`${isoDate}T12:00:00`)
    if (!version) {
      setViewing(null)
      setAsOfMessage(`No version of this entry was recorded by ${label}.`)
    } else if (version.action === "deleted") {
      setViewing(null)
      setAsOfMessage(`This entry had been deleted by ${label}.`)
    } else {
      setViewing(version)
    }
  }

  const startRevert = (version) => {
    setConfirming(version)
    setReason("")
    setError(null)
  }

  const confirmRevert = async () => {
    setReverting(true)
    setError(null)
    try {
      const saved = await revertEntry(projectId, entryId, { revision: confirming.revision, note: reason.trim() || undefined })
      setConfirming(null)
      setViewing(null)
      setAsOfDate("")
      await load()
      onReverted?.(saved)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setReverting(false)
    }
  }

  const canRevertTo = (version) =>
    canRevert && version.action !== "deleted" && version.revision !== current?.revision

  return (
    <section className="entry-history" aria-labelledby="entry-history-heading">
      <div className="entry-history-heading">
        <h3 id="entry-history-heading">History</h3>
        <button type="button" className="btn-text" onClick={load} disabled={loading}>
          {loading ? "Loading…" : history ? "Refresh" : "View history"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {history?.length === 0 && <p className="hint">No saved versions yet.</p>}

      {history?.length > 0 && (
        <>
          <label className="field-label entry-history-asof">
            View as it stood on
            <input type="date" value={asOfDate} onChange={(event) => showAsOf(event.target.value)} />
          </label>
          {asOfMessage && <p className="hint" role="status">{asOfMessage}</p>}

          {viewing && (
            <div className="entry-history-snapshot">
              <p className="entry-history-banner" role="status">
                {viewing.revision === current?.revision
                  ? `Viewing the current version (v${viewing.revision}).`
                  : `Viewing version from ${formatVersionDate(viewing.changed_at)} (not current).`}
              </p>
              {viewing.title && <p className="entry-history-snapshot-title">{viewing.title}</p>}
              <dl className="entry-detail-fields">
                {(viewing.schema_snapshot || []).map((field) => (
                  <div key={field.id} className="entry-detail-field">
                    <dt>{field.name}</dt>
                    <dd>{formatValue(field, viewing.data?.[field.id])}</dd>
                  </div>
                ))}
                <div className="entry-detail-field"><dt>Time spent</dt><dd>{viewing.time_spent != null ? `${viewing.time_spent} min` : "—"}</dd></div>
                <div className="entry-detail-field"><dt>Status</dt><dd>{viewing.todo ? `Still to do${viewing.due_date ? ` · due ${viewing.due_date}` : ""}` : "Done"}</dd></div>
              </dl>
              <div className="actions">
                <button type="button" className="btn-text" onClick={() => { setViewing(null); setAsOfDate("") }}>
                  Back to current
                </button>
                {canRevertTo(viewing) && (
                  <button type="button" className="btn-secondary" onClick={() => startRevert(viewing)}>
                    Revert to v{viewing.revision}
                  </button>
                )}
              </div>
            </div>
          )}

          {confirming && (
            <div className="entry-history-confirm" role="group" aria-label={`Revert to version ${confirming.revision}`}>
              <p>
                Revert to v{confirming.revision} from {formatVersionDate(confirming.changed_at)}? The current
                values are kept in history as their own version.
              </p>
              <label className="field-label">
                Reason (optional)
                <input type="text" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="btn-text" onClick={() => setConfirming(null)} disabled={reverting}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={confirmRevert} disabled={reverting}>
                  {reverting ? "Reverting…" : `Yes, revert to v${confirming.revision}`}
                </button>
              </div>
            </div>
          )}

          <ol className="entry-history-list">
            {history.map((version) => (
              <li key={version.id} className="entry-history-revision">
                <div className="entry-history-summary">
                  <strong>v{version.revision}</strong>
                  {" · "}
                  {ACTION_LABELS[version.action] || "Edited"}
                  {version.revision === current?.revision && version.action !== "deleted" && " (current)"}
                  {" · "}
                  <time dateTime={version.changed_at}>{new Date(version.changed_at).toLocaleString()}</time>
                  {version.changed_by_name ? ` · ${version.changed_by_name}` : ""}
                </div>
                {version.changed_fields?.length > 0 && (
                  <p className="entry-history-changes">
                    Changed: {version.changed_fields.map((key) => changedLabel(key, version.schema_snapshot || [])).join(", ")}
                  </p>
                )}
                {version.note && <p className="entry-history-note">{version.note}</p>}
                <div className="entry-history-actions">
                  {version.action !== "deleted" && (
                    <button type="button" className="btn-text" onClick={() => { setViewing(version); setAsOfDate(""); setAsOfMessage(null) }}>
                      View
                    </button>
                  )}
                  {canRevertTo(version) && (
                    <button type="button" className="btn-text" onClick={() => startRevert(version)}>
                      Revert to this version
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
