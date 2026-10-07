import { useRef, useState } from "react"
import { fetchExportDocument, importLogbook } from "./api"
import { useDialogFocus } from "./useDialogFocus"
import { EXPORT_FORMATS, buildExport } from "./exportFormats"
import "./dataTransfer.css"

/**
 * Export and import controls for the account menu (US-2.17).
 *
 * Rendered inside the dropdown, so this returns the menu buttons themselves
 * plus the file input and result dialog they need.
 */

/** Hand a generated file to the browser as a download. */
function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Released on the next tick; revoking immediately can cancel the download
  // in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function DataTransfer({ onImported, onClose }) {
  const fileInput = useRef(null)
  const [busy, setBusy] = useState(null)
  const [choosingFormat, setChoosingFormat] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  // The backdrop click and the Close button only clear the local
  // summary/error state (onClose closes the *parent* account dropdown, a
  // separate concern) — Escape needs to do the same thing the Close button
  // does, not skip past the state clear straight to closing the dropdown.
  const closeDialog = () => {
    setSummary(null)
    setError(null)
    onClose?.()
  }
  const dialogRef = useDialogFocus(Boolean(summary || error), closeDialog)

  const handleExport = async (formatId) => {
    setBusy("export")
    setError(null)
    setChoosingFormat(false)
    try {
      const document_ = await fetchExportDocument()
      const file = buildExport(formatId, document_)
      download(file.filename, file.contents, file.type)
      onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0]
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = ""
    if (!file) return

    setBusy("import")
    setError(null)

    try {
      const text = await file.text()

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error("That file is not valid JSON.")
      }

      const result = await importLogbook(parsed)
      setSummary(result)

      // Announced rather than passed up through the menu: this component is
      // rendered several levels below the state that needs refreshing.
      window.dispatchEvent(new Event("chronicles-imported"))
      onImported?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className="user-dropdown-item"
        role="menuitem"
        aria-expanded={choosingFormat}
        aria-haspopup="true"
        onClick={() => setChoosingFormat((open) => !open)}
        disabled={busy !== null}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{busy === "export" ? "Preparing…" : "Export"}</span>
      </button>

      {choosingFormat && (
        <div className="export-formats" role="group" aria-label="Export format">
          {EXPORT_FORMATS.map((format) => (
            <button key={format.id} type="button" role="menuitem" className="export-format" onClick={() => handleExport(format.id)}>
              <strong>{format.label}</strong>
              <span>{format.detail}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="user-dropdown-item"
        role="menuitem"
        onClick={() => fileInput.current?.click()}
        disabled={busy !== null}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{busy === "import" ? "Importing…" : "Import"}</span>
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChosen}
        className="sr-only"
        aria-label="Choose an exported Chronicles file"
      />

      {(summary || error) && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setSummary(null)
            setError(null)
          }}
        >
          <div
            ref={dialogRef}
            className="modal-card transfer-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-title"
            onClick={(event) => event.stopPropagation()}
            tabIndex={-1}
          >
            <h2 id="transfer-title">{error ? "Import failed" : "Import complete"}</h2>

            {error ? (
              <p className="error" role="alert">{error}</p>
            ) : (
              <>
                <ul className="transfer-summary" role="list">
                  <li>
                    <strong>{summary.projects_created}</strong> project
                    {summary.projects_created === 1 ? "" : "s"} restored
                  </li>
                  <li>
                    <strong>{summary.projects_reused}</strong> already here and
                    left untouched
                  </li>
                  <li>
                    <strong>{summary.entries_created}</strong> entr
                    {summary.entries_created === 1 ? "y" : "ies"} restored
                  </li>
                  {summary.tasks_created > 0 && (
                    <li>
                      <strong>{summary.tasks_created}</strong> task
                      {summary.tasks_created === 1 ? "" : "s"} restored
                    </li>
                  )}
                  <li>
                    <strong>{summary.entries_skipped}</strong> skipped
                  </li>
                </ul>

                {summary.issues?.length > 0 && (
                  <div className="transfer-issues">
                    <h3>Could not be restored</h3>
                    <p className="hint">
                      These entries do not fit the current schema of a project
                      you already have. Nothing in your file was changed.
                    </p>
                    <ul role="list">
                      {summary.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={closeDialog}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
