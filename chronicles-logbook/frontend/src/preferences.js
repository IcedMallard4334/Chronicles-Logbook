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
// A preset accent (Rose, Ocean...) is a whole look: the colour of buttons and
// highlights, a second colour they blend into, and a soft glow in the
// background scene. A custom colour replaces all three together, rather than
// being laid over the preset, so picking one never leaves a trace of the last.
//
//   Basic     one colour, from which all of that is derived.
//   Advanced  the pieces separately: controls, second colour, page glow, and
//             the page background itself.
//
// Everything is set as inline custom properties, which win over every theme and
// accent rule; clearing them hands control straight back to the preset.

const HEX = /^#[0-9a-f]{6}$/i
const KEYS = {
  accent: "chronicles-custom-accent",
  controls: "chronicles-custom-controls",
  second: "chronicles-custom-second",
  glow: "chronicles-custom-glow",
  background: "chronicles-custom-background",
}
const ACCENT_PARTS = ["accent", "controls", "second", "glow"]

const CONTROL_VARS = ["--blue", "--blue-soft", "--blue-bg", "--focus", "--character", "--character-soft", "--character-shadow"]
const SECOND_VARS = ["--mauve", "--mauve-soft", "--mauve-bg"]
const GLOW_VARS = ["--glow-1", "--glow-2", "--glow-3", "--glow-deep"]
const BACKGROUND_VARS = [
  "--bg", "--surface", "--surface-soft", "--surface-mauve", "--text", "--muted", "--line",
  "--wave-back", "--wave-mid", "--wave-front",
]

const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
const toHex = (values) => `#${values.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`

export function mixColours(from, to, amount) {
  const [a, b] = [channels(from), channels(to)]
  return toHex(a.map((value, index) => value + (b[index] - value) * amount))
}

/** The same colour with its hue turned by `degrees` (a neighbour on the colour wheel). */
export function rotateHue(hex, degrees) {
  const [r, g, b] = channels(hex).map((value) => value / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  let hue = 0
  let saturation = 0
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
  }
  const turned = (((hue + degrees) % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((turned / 60) % 2) - 1))
  const offset = lightness - chroma / 2
  const [rp, gp, bp] =
    turned < 60 ? [chroma, x, 0]
    : turned < 120 ? [x, chroma, 0]
    : turned < 180 ? [0, chroma, x]
    : turned < 240 ? [0, x, chroma]
    : turned < 300 ? [x, 0, chroma]
    : [chroma, 0, x]
  return toHex([(rp + offset) * 255, (gp + offset) * 255, (bp + offset) * 255])
}

export function isLightColour(hex) {
  const [r, g, b] = channels(hex).map((value) => {
    const unit = value / 255
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4
}

const valid = (value) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null)

export function readCustomColors() {
  const read = (key) => {
    try {
      return valid(window.localStorage.getItem(key))
    } catch {
      return null
    }
  }
  return Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, read(key)]))
}

export function saveCustomColors(colours) {
  try {
    for (const [name, key] of Object.entries(KEYS)) {
      const value = valid(colours[name])
      if (value) window.localStorage.setItem(key, value)
      else window.localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: the colours still apply for this visit.
  }
  applyCustomColors(colours)
}

/** Forget the accent-type customisations (a preset was chosen), keeping a custom background. */
export function clearAccentCustoms() {
  const current = readCustomColors()
  saveCustomColors({ ...current, accent: null, controls: null, second: null, glow: null })
}

export function applyCustomColors(colours = readCustomColors()) {
  const root = document.documentElement
  const given = Object.fromEntries(Object.keys(KEYS).map((name) => [name, valid(colours[name])]))

  ;[...CONTROL_VARS, ...SECOND_VARS, ...GLOW_VARS, ...BACKGROUND_VARS].forEach((name) => root.style.removeProperty(name))
  root.style.removeProperty("color-scheme")
  delete root.dataset.customButton
  delete root.dataset.customBackground
  delete root.dataset.customGlow

  const controls = given.controls || given.accent
  const second = given.second || (controls ? rotateHue(controls, 38) : null)
  const glow = given.glow || given.accent || given.controls

  if (controls) {
    root.style.setProperty("--blue", controls)
    root.style.setProperty("--focus", controls)
    root.style.setProperty("--character", controls)
    root.style.setProperty("--blue-soft", `color-mix(in srgb, ${controls} 38%, var(--surface))`)
    root.style.setProperty("--blue-bg", `color-mix(in srgb, ${controls} 16%, var(--surface))`)
    root.style.setProperty("--character-soft", `color-mix(in srgb, ${controls} 30%, var(--surface))`)
    root.style.setProperty("--character-shadow", mixColours(controls, "#000000", 0.3))
    root.dataset.customButton = isLightColour(controls) ? "light" : "dark"
  }

  if (second) {
    root.style.setProperty("--mauve", second)
    root.style.setProperty("--mauve-soft", `color-mix(in srgb, ${second} 38%, var(--surface))`)
    root.style.setProperty("--mauve-bg", `color-mix(in srgb, ${second} 16%, var(--surface))`)
  }

  if (glow) {
    root.style.setProperty("--glow-1", glow)
    root.style.setProperty("--glow-2", rotateHue(glow, 32))
    root.style.setProperty("--glow-3", rotateHue(glow, -28))
    root.style.setProperty("--glow-deep", mixColours(glow, "#000000", 0.78))
    root.dataset.customGlow = "on"
  }

  if (given.background) {
    const background = given.background
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

export function hasAccentCustoms(colours) {
  return ACCENT_PARTS.some((name) => Boolean(colours[name]))
}

export function savePreferences(preferences) {
  clearAccentCustoms()
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
