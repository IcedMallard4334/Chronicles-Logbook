const API_BASE_URL =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_URL) ||
  "http://localhost:8000"

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const token = window.localStorage.getItem("chronicles_token")
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = body.detail
      ? Array.isArray(body.detail)
        ? body.detail.map((item) => item.msg || String(item)).join(" ")
        : String(body.detail)
      : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export async function fetchProjects() {
  return request("/projects")
}

export async function fetchProject(id) {
  return request(`/projects/${id}`)
}

export async function createProject(project) {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify(project),
  })
}

export async function updateProject(id, project) {
  return request(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(project),
  })
}

export async function archiveProject(id) {
  return request(`/projects/${id}/archive`, { method: "POST" })
}

export async function unarchiveProject(id) {
  return request(`/projects/${id}/unarchive`, { method: "POST" })
}

export async function fetchEntries(projectId) {
  return request(`/projects/${projectId}/entries`)
}

export async function fetchEntriesGlobal({
  q,
  projectId,
  page = 1,
  pageSize = 20,
} = {}) {
  const params = new URLSearchParams()
  if (q) params.append("q", q)
  if (projectId) params.append("project_id", projectId)
  params.append("page", page)
  params.append("page_size", pageSize)
  return request(`/entries?${params.toString()}`)
}

export async function createEntry(projectId, payload) {
  const hasNestedData = payload && typeof payload === "object" && "data" in payload
  const { data, time_spent = null } = hasNestedData
    ? payload
    : { data: payload, time_spent: null }
  return request(`/projects/${projectId}/entries`, {
    method: "POST",
    body: JSON.stringify({ data, time_spent }),
  })
}

export function getGoogleLoginUrl() {
  return `${API_BASE_URL}/auth/google/login`
}

export async function fetchCurrentUser() {
  return request("/auth/me")
}

export async function deleteAccount() {
  return request("/auth/account", { method: "DELETE" })
}

// ── Tasks ────────────────────────────────────────────────────────────

export async function fetchTasks(projectId, completed) {
  const params = completed !== undefined ? `?completed=${completed}` : ""
  return request(`/projects/${projectId}/tasks${params}`)
}

export async function createTask(projectId, task) {
  return request(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(task),
  })
}

export async function updateTask(projectId, taskId, task) {
  return request(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(task),
  })
}

export async function toggleTask(projectId, taskId) {
  return request(`/projects/${projectId}/tasks/${taskId}/toggle`, {
    method: "PATCH",
  })
}

export async function deleteTask(projectId, taskId) {
  return request(`/projects/${projectId}/tasks/${taskId}`, {
    method: "DELETE",
  })
}

// ── Google Calendar ────────────────────────────────────────────────

export async function fetchGoogleCalendarStatus() {
  return request("/calendar/google/status")
}

export async function fetchGoogleCalendarAuthUrl() {
  const { authorization_url } = await request("/calendar/google/auth")
  return authorization_url
}

export async function disconnectGoogleCalendar() {
  return request("/calendar/google/disconnect", { method: "DELETE" })
}

export async function fetchGoogleCalendarEvents({ start, end }) {
  const params = new URLSearchParams({ start, end })
  return request(`/calendar/google/events?${params.toString()}`)
}
