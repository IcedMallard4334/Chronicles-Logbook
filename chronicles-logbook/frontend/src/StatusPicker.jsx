import { projectStatuses } from "./statuses"

/**
 * The status an entry is in, for projects that have defined their own. The
 * default pair is covered by the "still to do" checkbox instead, so nothing
 * changes for a project that never customised them.
 */
export default function StatusPicker({ project, value, onChange }) {
  const statuses = projectStatuses(project)
  return (
    <label className="field-label status-picker">
      Status
      <select value={value} onChange={(event) => onChange(event.target.value, statuses.find((item) => item.name === event.target.value)?.done ?? false)}>
        {statuses.map((item) => (
          <option key={item.name} value={item.name}>
            {item.name}{item.done ? " (finished)" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}
