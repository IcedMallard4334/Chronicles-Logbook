import { TrashButton } from "./TrashIcon"
import { DEFAULT_STATUSES } from "./statuses"

const MAX = 8

/** Why a list of statuses can't be saved, or null when it can. */
export function statusProblem(statuses) {
  if (statuses.length < 2 || statuses.length > MAX) return `Use between 2 and ${MAX} statuses.`
  const names = statuses.map((item) => item.name.trim().toLowerCase())
  if (names.some((name) => !name)) return "Every status needs a name."
  if (new Set(names).size !== names.length) return "Status names must be different from each other."
  if (!statuses.some((item) => item.done) || statuses.every((item) => item.done)) {
    return "Include at least one status that counts as done and one that does not."
  }
  return null
}

/** Edit the ordered statuses a project's entries move through. */
export default function StatusEditor({ statuses, onChange }) {
  const update = (index, change) => onChange(statuses.map((item, i) => (i === index ? { ...item, ...change } : item)))
  const move = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= statuses.length) return
    const next = [...statuses]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const problem = statusProblem(statuses)

  return (
    <fieldset className="status-editor">
      <legend>Statuses</legend>
      <p className="hint">The stages an entry moves through on the Board. Tick the ones that mean the work is finished.</p>
      <ul>
        {statuses.map((item, index) => (
          <li key={index}>
            <input
              type="text"
              aria-label={`Status ${index + 1} name`}
              value={item.name}
              maxLength={40}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <label className="status-done">
              <input type="checkbox" checked={item.done} onChange={(event) => update(index, { done: event.target.checked })} />
              Finished
            </label>
            <button type="button" className="btn-text" aria-label={`Move status ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className="btn-text" aria-label={`Move status ${index + 1} down`} disabled={index === statuses.length - 1} onClick={() => move(index, 1)}>↓</button>
            <TrashButton label={`Remove status ${item.name || index + 1}`} disabled={statuses.length <= 2} onClick={() => onChange(statuses.filter((_, i) => i !== index))} />
          </li>
        ))}
      </ul>
      <div className="status-editor-actions">
        <button type="button" className="btn-secondary" disabled={statuses.length >= MAX} onClick={() => onChange([...statuses, { name: "", done: false }])}>
          + Add status
        </button>
        <button type="button" className="btn-text" onClick={() => onChange(DEFAULT_STATUSES.map((item) => ({ ...item })))}>
          Reset to Still to do / Done
        </button>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </fieldset>
  )
}
