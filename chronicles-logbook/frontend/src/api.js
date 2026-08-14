const API_BASE_URL =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_URL) ||
  "http://localhost:8000"

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
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

export async function fetchEntries(projectId) {
  return request(`/projects/${projectId}/entries`)
}

export async function createEntry(projectId, data) {
  return request(`/projects/${projectId}/entries`, {
    method: "POST",
    body: JSON.stringify({ data }),
  })
}

export async function signUp(credentials) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify(credentials),
  })
}

export async function signIn(credentials) {
  return request("/auth/signin", {
    method: "POST",
    body: JSON.stringify(credentials),
  })
}
