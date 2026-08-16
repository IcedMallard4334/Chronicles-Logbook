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

export async function fetchEntriesGlobal({ q, projectId } = {}) {
  const params = new URLSearchParams()
  if (q) params.append("q", q)
  if (projectId) params.append("project_id", projectId)
  const query = params.toString()
  return request(`/entries${query ? `?${query}` : ""}`)
}

export async function createEntry(projectId, data) {
  return request(`/projects/${projectId}/entries`, {
    method: "POST",
    body: JSON.stringify({ data }),
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
