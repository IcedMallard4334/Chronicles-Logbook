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
  applyCustomColors()
}

// ── Custom colours ────────────────────────────────────────────────────
// A person's own button and background colours sit on top of the theme: they
// are set as inline variables, so they win over every light, dark and accent
// rule, and clearing them hands control straight back to the theme.

const HEX = /^#[0-9a-f]{6}$/i
const BUTTON_KEY = "chronicles-custom-button"
const BACKGROUND_KEY = "chronicles-custom-background"
const BUTTON_VARS = ["--blue", "--blue-soft", "--blue-bg", "--focus", "--character"]
const BACKGROUND_VARS = [
  "--bg", "--surface", "--surface-soft", "--surface-mauve", "--text", "--muted", "--line",
  "--wave-back", "--wave-mid", "--wave-front",
]

const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
const toHex = (values) => `#${values.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`

export function mixColours(from, to, amount) {
  const [a, b] = [channels(from), channels(to)]
  return toHex(a.map((value, index) => value + (b[index] - value) * amount))
}

export function isLightColour(hex) {
  const [r, g, b] = channels(hex).map((value) => {
    const unit = value / 255
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4
}

export function readCustomColors() {
  const read = (key) => {
    try {
      const value = window.localStorage.getItem(key)
      return value && HEX.test(value) ? value.toLowerCase() : null
    } catch {
      return null
    }
  }
  return { button: read(BUTTON_KEY), background: read(BACKGROUND_KEY) }
}

export function saveCustomColors({ button, background }) {
  try {
    for (const [key, value] of [[BUTTON_KEY, button], [BACKGROUND_KEY, background]]) {
      if (value && HEX.test(value)) window.localStorage.setItem(key, value)
      else window.localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: the colours still apply for this visit.
  }
  applyCustomColors({ button, background })
}

export function applyCustomColors(colours = readCustomColors()) {
  const root = document.documentElement
  const button = colours.button && HEX.test(colours.button) ? colours.button : null
  const background = colours.background && HEX.test(colours.background) ? colours.background : null

  BUTTON_VARS.forEach((name) => root.style.removeProperty(name))
  BACKGROUND_VARS.forEach((name) => root.style.removeProperty(name))
  root.style.removeProperty("color-scheme")
  delete root.dataset.customButton
  delete root.dataset.customBackground

  if (button) {
    root.style.setProperty("--blue", button)
    root.style.setProperty("--character", button)
    root.style.setProperty("--focus", button)
    root.style.setProperty("--blue-soft", `color-mix(in srgb, ${button} 40%, var(--surface))`)
    root.style.setProperty("--blue-bg", `color-mix(in srgb, ${button} 14%, var(--surface))`)
    root.dataset.customButton = isLightColour(button) ? "light" : "dark"
  }

  if (background) {
    const dark = !isLightColour(background)
    const white = "#ffffff"
    const contrast = dark ? white : "#000000"
    root.style.setProperty("--bg", background)
    root.style.setProperty("--surface", mixColours(background, white, dark ? 0.08 : 0.6))
    root.style.setProperty("--surface-soft", mixColours(background, white, dark ? 0.14 : 0.4))
    root.style.setProperty("--surface-mauve", mixColours(background, white, dark ? 0.11 : 0.5))
    root.style.setProperty("--line", mixColours(background, contrast, dark ? 0.2 : 0.14))
    root.style.setProperty("--text", dark ? "#f1f2f6" : "#1c1f26")
    root.style.setProperty("--muted", dark ? "#b8bfce" : "#5b6270")
    root.style.setProperty("--wave-back", mixColours(background, contrast, 0.06))
    root.style.setProperty("--wave-mid", mixColours(background, contrast, 0.1))
    root.style.setProperty("--wave-front", mixColours(background, contrast, 0.14))
    root.style.setProperty("color-scheme", dark ? "dark" : "light")
    root.dataset.customBackground = dark ? "dark" : "light"
  }
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
