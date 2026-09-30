import { afterEach, describe, expect, it } from "vitest"

import { applyCustomColors, applyPreferences, isLightColour, mixColours, readCustomColors, saveCustomColors } from "./preferences"

const root = document.documentElement

afterEach(() => {
  window.localStorage.clear()
  applyCustomColors({ button: null, background: null })
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
})

describe("custom colours", () => {
  it("applies a button colour over the theme's accent", () => {
    saveCustomColors({ button: "#ff5500", background: null })

    expect(root.style.getPropertyValue("--blue")).toBe("#ff5500")
    expect(root.style.getPropertyValue("--focus")).toBe("#ff5500")
    expect(root.dataset.customButton).toBe("dark")
    expect(readCustomColors()).toEqual({ button: "#ff5500", background: null })
  })

  it("flags a light button colour so its label can switch to dark text", () => {
    saveCustomColors({ button: "#ffe14d", background: null })
    expect(root.dataset.customButton).toBe("light")
  })

  it("derives a readable palette from a dark background", () => {
    saveCustomColors({ button: null, background: "#101820" })

    expect(root.style.getPropertyValue("--bg")).toBe("#101820")
    expect(root.style.getPropertyValue("--text")).toBe("#f1f2f6")
    expect(root.style.getPropertyValue("color-scheme")).toBe("dark")
    expect(root.dataset.customBackground).toBe("dark")
    expect(root.style.getPropertyValue("--surface")).not.toBe("")
  })

  it("derives dark text for a light background", () => {
    saveCustomColors({ button: null, background: "#fff4e0" })

    expect(root.style.getPropertyValue("--text")).toBe("#1c1f26")
    expect(root.dataset.customBackground).toBe("light")
  })

  it("clears everything back to the theme when reset", () => {
    saveCustomColors({ button: "#ff5500", background: "#101820" })
    saveCustomColors({ button: null, background: null })

    expect(root.style.getPropertyValue("--blue")).toBe("")
    expect(root.style.getPropertyValue("--bg")).toBe("")
    expect(root.dataset.customButton).toBeUndefined()
    expect(window.localStorage.getItem("chronicles-custom-button")).toBeNull()
  })

  it("ignores stored values that are not colours", () => {
    window.localStorage.setItem("chronicles-custom-button", "red; background: url(x)")
    window.localStorage.setItem("chronicles-custom-background", "#12")

    expect(readCustomColors()).toEqual({ button: null, background: null })
  })

  it("is re-applied whenever the theme preferences are", () => {
    window.localStorage.setItem("chronicles-custom-button", "#00aa66")

    applyPreferences({ theme: "dark", accent: "ocean", density: "compact" })

    expect(root.style.getPropertyValue("--blue")).toBe("#00aa66")
    expect(root.dataset.accent).toBe("ocean")
  })
})
