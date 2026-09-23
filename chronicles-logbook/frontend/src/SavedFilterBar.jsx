import { useCallback, useEffect, useState } from "react"
import { deleteSavedFilter, fetchSavedFilters, saveFilter } from "./api"

/**
 * Name the current entry filters, and put a saved set back in one click (US-2.12).
 *
 * The bar owns its own list rather than receiving it, so the page above only
 * has to say what the current criteria are and what to do when one is
 * re-applied.
 */
export function SavedFilterBar({ criteria, onApply }) {
  const [filters, setFilters] = useState([])
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchSavedFilters()
      .then(setFilters)
      .catch((caught) => setError(caught.message))
  }, [])

  useEffect(load, [load])

  const save = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setBusy(true)
    setError("")
    try {
      const saved = await saveFilter(trimmed, criteria)
      // Replace by id so re-saving an existing name updates that chip in
      // place instead of adding a second one with the same label.
      setFilters((previous) => [
        saved,
        ...previous.filter((filter) => filter.id !== saved.id),
      ])
      setName("")
    } catch (caught) {
      setError(caught.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (filterId) => {
    setError("")
    try {
      await deleteSavedFilter(filterId)
      setFilters((previous) => previous.filter((filter) => filter.id !== filterId))
    } catch (caught) {
      setError(caught.message)
    }
  }

  return (
    <div className="saved-filters" aria-label="Saved filters">
      <form className="saved-filters-save" onSubmit={save}>
        <label>
          Save these filters as
          <input
            type="text"
            placeholder="e.g. Overdue design work"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save filter"}
        </button>
      </form>

      {filters.length > 0 && (
        <ul className="saved-filters-list">
          {filters.map((filter) => (
            <li key={filter.id} className="saved-filter">
              <button
                type="button"
                className="saved-filter-apply"
                onClick={() => onApply(filter.criteria)}
              >
                {filter.name}
              </button>
              <button
                type="button"
                className="saved-filter-remove"
                aria-label={`Delete saved filter ${filter.name}`}
                onClick={() => remove(filter.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default SavedFilterBar
