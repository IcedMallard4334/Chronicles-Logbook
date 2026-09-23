export const ACCENTS = [
  { id: "chronicles", name: "Chronicles", description: "Blue and purple", recommended: true },
  { id: "ocean", name: "Ocean", description: "Blue and teal" },
  { id: "forest", name: "Forest", description: "Green and slate" },
  { id: "rose", name: "Rose", description: "Berry and violet" },
]

export function readPreference(key, fallback) {
  return window.localStorage.getItem(`chronicles-${key}`) || fallback
}

export function applyPreferences({ theme, accent, density }) {
  const root = document.documentElement
  if (theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
  root.dataset.accent = accent
  root.dataset.density = density
}

export function savePreferences(preferences) {
  window.localStorage.setItem("chronicles-theme", preferences.theme)
  window.localStorage.setItem("chronicles-accent", preferences.accent)
  window.localStorage.setItem("chronicles-density", preferences.density)
  window.localStorage.setItem("chronicles-start-view", preferences.startView)
  window.localStorage.setItem("chronicles-setup-complete", "true")
  const user = JSON.parse(window.localStorage.getItem("chronicles_user") || "null")
  if (user?.id) window.localStorage.setItem(`chronicles-setup-complete-${user.id}`, "true")
  applyPreferences(preferences)
}

export function hasCompletedSetup(userId) {
  return Boolean(userId && window.localStorage.getItem(`chronicles-setup-complete-${userId}`) === "true")
}
