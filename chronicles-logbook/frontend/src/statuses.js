// Entry statuses. A project's own list, or the pair every project started with.

export const DEFAULT_STATUSES = [
  { name: "Still to do", done: false },
  { name: "Done", done: true },
]

export function projectStatuses(project) {
  return project?.statuses?.length ? project.statuses : DEFAULT_STATUSES
}

export function hasCustomStatuses(project) {
  const statuses = projectStatuses(project)
  return statuses.length !== 2 || statuses[0].name !== "Still to do" || statuses[1].name !== "Done"
}

export function isDoneStatus(project, name) {
  return projectStatuses(project).some((status) => status.name === name && status.done)
}

/** The status an entry is in, read against its project's list (older rows may carry none). */
export function statusOf(entry, project) {
  const statuses = projectStatuses(project)
  if (entry.status && statuses.some((status) => status.name === entry.status)) return entry.status
  const fallback = statuses.find((status) => status.done === !entry.todo)
  return (fallback || statuses[0]).name
}

/** Names worth adding to a status filter: every custom name, once, except the built-in pair. */
export function customStatusNames(projects) {
  const names = new Set()
  for (const project of projects || []) {
    for (const status of projectStatuses(project)) {
      if (status.name !== "Still to do" && status.name !== "Done") names.add(status.name)
    }
  }
  return [...names]
}

// The Status filter is one control with values "", "true", "false" or "status:<name>".
const PREFIX = "status:"

export function statusFilterParams(value) {
  if (value === "") return {}
  if (value.startsWith(PREFIX)) return { status: value.slice(PREFIX.length) }
  return { todo: value === "true" }
}

export function statusFilterCriteria(value) {
  if (value === "") return { todo: null, status: null }
  if (value.startsWith(PREFIX)) return { todo: null, status: value.slice(PREFIX.length) }
  return { todo: value === "true", status: null }
}

export function statusFilterValue(saved) {
  if (saved?.status) return `${PREFIX}${saved.status}`
  return saved?.todo == null ? "" : String(saved.todo)
}
