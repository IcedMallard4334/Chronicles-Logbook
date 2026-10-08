import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

import "./Drawer.css"

/**
 * A side drawer: the place a form opens, instead of a window over the app.
 *
 * It docks to the right edge the way a side panel does in a code editor. The page
 * beside it stays live (no backdrop, no focus trap), is pushed over to make room,
 * and the drawer's left edge can be dragged to the width that suits the form. The
 * width is remembered, and the arrow keys resize it from the keyboard. On a phone
 * there is no room beside it, so it takes the screen and the edge handle is hidden.
 *
 * Escape closes it while focus is inside, but never from elsewhere on the page,
 * because the page is still in use.
 */

const WIDTH_KEY = "chronicles-drawer-width"
export const DRAWER_MIN_WIDTH = 360
export const DRAWER_DEFAULT_WIDTH = 520
const DRAWER_MAX_WIDTH = 960
const PAGE_MIN_WIDTH = 320
const KEY_STEP = 24
// Below this much room beside the drawer the top bar drops to icons, so it still fits.
const COMPACT_PAGE_WIDTH = 1100

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function widestDrawer() {
  const room = typeof window === "undefined" ? DRAWER_MAX_WIDTH : window.innerWidth - PAGE_MIN_WIDTH
  return Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, room))
}

/** A width kept inside what the drawer and the page beside it can share. */
export function clampDrawerWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width)) return Math.min(DRAWER_DEFAULT_WIDTH, widestDrawer())
  return Math.round(Math.min(widestDrawer(), Math.max(DRAWER_MIN_WIDTH, width)))
}

function storedWidth() {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY))
    return saved > 0 ? clampDrawerWidth(saved) : clampDrawerWidth(DRAWER_DEFAULT_WIDTH)
  } catch {
    return clampDrawerWidth(DRAWER_DEFAULT_WIDTH)
  }
}

function rememberWidth(width) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width))
  } catch {
    // The width just won't be remembered.
  }
}

// How many drawers are open, so the page is made room for until the last one closes.
let openDrawers = 0

function reserveRoom(width) {
  document.documentElement.style.setProperty("--drawer-inset", `${width}px`)
}

export default function Drawer({ title, subtitle, onClose, closeLabel = "Close", busy = false, className = "", children }) {
  const headingId = useId()
  const panelRef = useRef(null)
  const [width, setWidth] = useState(storedWidth)
  const [resizing, setResizing] = useState(false)
  const latest = useRef({ onClose, width })
  latest.current = { onClose, width }

  // Make room beside the drawer while it is open, and give the page back afterwards.
  useEffect(() => {
    openDrawers += 1
    document.documentElement.classList.add("has-drawer")
    return () => {
      openDrawers -= 1
      if (openDrawers <= 0) {
        openDrawers = 0
        document.documentElement.classList.remove("has-drawer", "drawer-compact")
        document.documentElement.style.removeProperty("--drawer-inset")
      }
    }
  }, [])
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    reserveRoom(width)
    document.documentElement.classList.toggle("drawer-compact", windowWidth - width < COMPACT_PAGE_WIDTH)
  }, [width, windowWidth])

  // Focus moves in when it opens and goes back to whatever opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement
    const panel = panelRef.current
    const first = panel?.querySelector(".drawer-body")?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus({ preventScroll: true })
    return () => {
      if (opener && opener !== document.body && document.contains(opener)) opener.focus?.({ preventScroll: true })
    }
  }, [])

  // The window can shrink under an open drawer.
  useEffect(() => {
    const keepFitting = () => {
      setWindowWidth(window.innerWidth)
      setWidth((current) => clampDrawerWidth(current))
    }
    window.addEventListener("resize", keepFitting)
    return () => window.removeEventListener("resize", keepFitting)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("drawer-resizing", resizing)
    return () => document.documentElement.classList.remove("drawer-resizing")
  }, [resizing])

  const startResize = (event) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setResizing(true)
  }
  const moveResize = (event) => {
    if (!resizing) return
    setWidth(clampDrawerWidth(window.innerWidth - event.clientX))
  }
  const endResize = () => {
    if (!resizing) return
    setResizing(false)
    rememberWidth(latest.current.width)
  }
  const resizeFromKeyboard = (event) => {
    const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP
    let next = null
    if (event.key === "ArrowLeft") next = latest.current.width + step
    else if (event.key === "ArrowRight") next = latest.current.width - step
    else if (event.key === "Home") next = widestDrawer()
    else if (event.key === "End") next = DRAWER_MIN_WIDTH
    if (next === null) return
    event.preventDefault()
    const fitted = clampDrawerWidth(next)
    setWidth(fitted)
    rememberWidth(fitted)
  }
  const resetWidth = () => {
    const fitted = clampDrawerWidth(DRAWER_DEFAULT_WIDTH)
    setWidth(fitted)
    rememberWidth(fitted)
  }

  const onKeyDown = (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation()
      latest.current.onClose?.()
    }
  }

  // Rendered straight onto <body>: the pages that open a drawer sit inside animated
  // wrappers, and any transform on an ancestor would make this "fixed" panel position
  // itself inside that wrapper instead of against the window.
  return createPortal(
    <aside
      ref={panelRef}
      className={`drawer${resizing ? " is-resizing" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--drawer-width": `${width}px` }}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div
        className="drawer-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuemin={DRAWER_MIN_WIDTH}
        aria-valuemax={widestDrawer()}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={resizeFromKeyboard}
        onDoubleClick={resetWidth}
        title="Drag to resize. Double-click to reset."
      />
      <header className="drawer-head">
        <div className="drawer-heading">
          <h2 id={headingId}>{title}</h2>
          {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
      </header>
      <div className={`drawer-progress${busy ? " is-busy" : ""}`} aria-hidden="true" />
      <div className="drawer-body">{children}</div>
    </aside>,
    document.body
  )
}
