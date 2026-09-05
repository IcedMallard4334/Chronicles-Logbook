const API_BASE_URL =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_URL) ||
  "http://localhost:8000"

let renewal = null
let sessionGeneration = 0

export function refreshSession() {
  if (!renewal) {
    const generation = sessionGeneration
    renewal = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      if (!response.ok) {
        const error = new Error(response.status === 401 ? "Your session has ended. Please sign in again." : "Unable to restore your session. Please try again.")
        error.status = response.status
        throw error
      }
      const session = await response.json()
      if (generation !== sessionGeneration) throw new Error("Session changed.")
      window.localStorage.setItem("chronicles_token", session.access_token)
      window.localStorage.setItem("chronicles_user", JSON.stringify(session.user))
      return session
    })().finally(() => { renewal = null })
  }
  return renewal
}

export async function signOut() {
  sessionGeneration += 1
  // Never silently restore a cookie session after an offline sign-out.
  window.localStorage.setItem("chronicles_signed_out", "true")
  window.localStorage.removeItem("chronicles_token")
  window.localStorage.removeItem("chronicles_user")
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" })
  } finally {
    window.location.assign("/")
  }
}

async function request(path, options = {}, retried = false) {
  const url = `${API_BASE_URL}${path}`
  const token = window.localStorage.getItem("chronicles_token")
  let response
  try {
    response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  } catch {
    throw new Error("Cannot reach the Chronicles API. Check that the backend is running and allows this preview address.")
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const sessionError = response.status === 401 && ["Invalid or expired session.", "Authentication required.", "Account no longer exists."].includes(body.detail)
    if (sessionError && !retried && !window.localStorage.getItem("chronicles_signed_out")) {
      try {
        await refreshSession()
      } catch (error) {
        if (error.status === 401) {
          window.localStorage.removeItem("chronicles_token")
          window.localStorage.removeItem("chronicles_user")
          window.dispatchEvent(new Event("chronicles-session-ended"))
        }
        throw error
      }
      return request(path, options, true)
    }
    const message = body.detail
      ? Array.isArray(body.detail)
        ? body.detail.map((item) => item.msg || String(item)).join(" ")
        : String(body.detail)
      : `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
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

export async function disconnectGoogleCalendar(accountId) {
  const query = accountId ? `?account_id=${encodeURIComponent(accountId)}` : ""
  return request(`/calendar/google/disconnect${query}`, { method: "DELETE" })
}

export async function fetchGoogleCalendarEvents({ start, end, accountId }) {
  const params = new URLSearchParams({ start, end })
  if (accountId) params.set("account_id", accountId)
  return request(`/calendar/google/events?${params.toString()}`)
}

export function fetchCalendarActivities({start, end}) {
  return request(`/calendar/activities?${new URLSearchParams({start, end})}`)
}
export function createCalendarActivity(payload) {
  return request("/calendar/activities", {method: "POST", body: JSON.stringify(payload)})
}
export function deleteCalendarActivity(id) {
  return request(`/calendar/activities/${encodeURIComponent(id)}`, {method: "DELETE"})
}

// ── AI Assistant ──────────────────────────────────────────────────────

export async function sendAIMessage(message) {
  return request("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  })
}
