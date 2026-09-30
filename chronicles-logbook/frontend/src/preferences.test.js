import { afterEach, describe, expect, it } from "vitest"

import {
  applyCustomColors, applyPreferences, clearAccentCustoms, hasAccentCustoms, isLightColour, mixColours,
  readCustomColors, rotateHue, saveCustomColors, savePreferences,
} from "./preferences"

const root = document.documentElement
const NONE = { accent: null, controls: null, second: null, glow: null, background: null }

afterEach(() => {
  window.localStorage.clear()
  applyCustomColors(NONE)
  delete root.dataset.accent
})

describe("colour maths", () => {
  it("mixes two colours by an amount", () => {
    expect(mixColours("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(mixColours("#102030", "#102030", 0.7)).toBe("#102030")
    expect(mixColours("#000000", "#ffffff", 0)).toBe("#000000")
  })

  it("tells light colours from dark ones", () => {
    expect(isLightColour("#ffffff")).toBe(true)
    expect(isLightColour("#f5f6fa")).toBe(true)
    expect(isLightColour("#12141a")).toBe(false)
    expect(isLightColour("#6b5bff")).toBe(false)
    expect(isLightColour("#ffe14d")).toBe(true)
  })

  it("turns a hue round the colour wheel, keeping grey grey", () => {
    expect(rotateHue("#ff0000", 120)).toBe("#00ff00")
    expect(rotateHue("#ff0000", 240)).toBe("#0000ff")
    expect(rotateHue("#ff0000", -60)).toBe("#ff00ff")
    expect(rotateHue("#ff0000", 360)).toBe("#ff0000")
    expect(rotateHue("#808080", 90)).toBe("#808080")
    expect(rotateHue("#00ffff", 60)).toBe("#0000ff")
    expect(rotateHue("#00ff00", 60)).toBe("#00ffff")
  })
})

describe("basic: one colour replaces the preset", () => {
  it("sets buttons, highlights, the second colour and the background glow together", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500" })

    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--focus")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--mauve")).toBe(rotateHue("#ff5500", 38))
    expect(root.style.getPropertyValue("--blue-bg")).toContain("#ff5500")
    expect(root.style.getPropertyValue("--mauve-bg")).toContain(rotateHue("#ff5500", 38))
    expect(root.style.getPropertyValue("--glow-1")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--glow-2")).toBe(rotateHue("#ff5500", 32))
    expect(root.dataset.customGlow).toBe("on")
    expect(root.dataset.customButton).toBe("dark")
    expect(readCustomColors().accent).toBe("#ff5500")
  })

  it("leaves no trace of the previous colour when a new one is picked", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500" })
    saveCustomColors({ ...NONE, accent: "#00aa66" })

    for (const name of ["--blue", "--mauve", "--mauve-soft", "--blue-soft", "--glow-1", "--glow-2", "--glow-3", "--glow-deep"]) {
      expect(root.style.getPropertyValue(name).toLowerCase()).not.toContain("ff5500")
    }
    expect(root.style.getPropertyValue("--blue")).toBe("#00aa66")
  })

  it("flags a light colour so button labels can switch to dark text", () => {
    saveCustomColors({ ...NONE, accent: "#ffe14d" })
    expect(root.dataset.customButton).toBe("light")
  })

  it("does not touch the page background", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500" })
    expect(root.style.getPropertyValue("--bg")).toBe("")
    expect(root.dataset.customBackground).toBeUndefined()
  })
})

describe("advanced: the pieces separately", () => {
  it("controls, second colour and glow are independent", () => {
    saveCustomColors({ ...NONE, controls: "#ff5500", second: "#00aaff", glow: "#22cc88" })

    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--mauve")).toBe("#00aaff")
    expect(root.style.getPropertyValue("--glow-1")).toBe("#22cc88")
  })

  it("a second colour alone changes only the second colour", () => {
    saveCustomColors({ ...NONE, second: "#00aaff" })

    expect(root.style.getPropertyValue("--mauve")).toBe("#00aaff")
    expect(root.style.getPropertyValue("--blue")).toBe("")
    expect(root.dataset.customGlow).toBeUndefined()
  })

  it("controls alone derive their own second colour and glow", () => {
    saveCustomColors({ ...NONE, controls: "#ff5500" })

    expect(root.style.getPropertyValue("--mauve")).toBe(rotateHue("#ff5500", 38))
    expect(root.style.getPropertyValue("--glow-1")).toBe("#ff5500")
  })

  it("an explicit glow beats the glow derived from the accent", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500", glow: "#2244ff" })

    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--glow-1")).toBe("#2244ff")
  })

  it("derives a readable palette from a dark page background", () => {
    saveCustomColors({ ...NONE, background: "#101820" })

    expect(root.style.getPropertyValue("--bg")).toBe("#101820")
    expect(root.style.getPropertyValue("--text")).toBe("#f1f2f6")
    expect(root.style.getPropertyValue("color-scheme")).toBe("dark")
    expect(root.dataset.customBackground).toBe("dark")
    expect(root.style.getPropertyValue("--surface")).not.toBe("")
  })

  it("derives dark text for a light page background", () => {
    saveCustomColors({ ...NONE, background: "#fff4e0" })

    expect(root.style.getPropertyValue("--text")).toBe("#1c1f26")
    expect(root.dataset.customBackground).toBe("light")
  })
})

describe("resetting and storing", () => {
  it("clears everything back to the preset when reset", () => {
    saveCustomColors({ accent: "#ff5500", controls: "#111111", second: "#222222", glow: "#333333", background: "#101820" })
    saveCustomColors(NONE)

    for (const name of ["--blue", "--mauve", "--glow-1", "--bg"]) expect(root.style.getPropertyValue(name)).toBe("")
    expect(root.dataset.customGlow).toBeUndefined()
    expect(root.dataset.customButton).toBeUndefined()
    expect(window.localStorage.getItem("chronicles-custom-accent")).toBeNull()
  })

  it("ignores stored values that are not colours", () => {
    window.localStorage.setItem("chronicles-custom-accent", "red; background: url(x)")
    window.localStorage.setItem("chronicles-custom-background", "#12")

    expect(readCustomColors()).toEqual(NONE)
  })

  it("is re-applied whenever the theme preferences are", () => {
    window.localStorage.setItem("chronicles-custom-accent", "#00aa66")

    applyPreferences({ theme: "dark", accent: "ocean", density: "compact" })

    expect(root.style.getPropertyValue("--blue")).toBe("#00aa66")
    expect(root.dataset.accent).toBe("ocean")
  })

  it("choosing a preset drops the accent customisations but keeps a custom background", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500", glow: "#2244ff", background: "#101820" })
    expect(hasAccentCustoms(readCustomColors())).toBe(true)

    clearAccentCustoms()

    const after = readCustomColors()
    expect(hasAccentCustoms(after)).toBe(false)
    expect(after.background).toBe("#101820")
    expect(root.style.getPropertyValue("--blue")).toBe("")
    expect(root.style.getPropertyValue("--bg")).toBe("#101820")
  })

  it("saving the setup choices also hands the accent back to the preset", () => {
    saveCustomColors({ ...NONE, accent: "#ff5500" })

    savePreferences({ theme: "dark", accent: "rose", density: "comfortable", startView: "home" })

    expect(root.style.getPropertyValue("--blue")).toBe("")
    expect(root.dataset.accent).toBe("rose")
  })
})
