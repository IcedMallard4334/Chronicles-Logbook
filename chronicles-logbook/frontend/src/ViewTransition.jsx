/**
 * Moving between views without anything snapping into place.
 *
 * Two separate jobs, which look the same and are not.
 *
 * `ViewTransition` covers the switch itself: the outgoing view settles down
 * and out, the incoming one rises in. It is short — under a third of a second
 * — because a transition you have time to watch is a transition that gets in
 * your way on the fifth use. What it buys is continuity: without it, clicking
 * a tab replaces the entire page contents in one frame, and the eye reads that
 * as a reload rather than as a move.
 *
 * `ViewLoader` covers the wait: the same flowing lines the landing page uses,
 * drawing themselves left to right. It only appears after a short delay, so a
 * fast response never flashes a loader — the flash is what makes an app feel
 * unsteady, not the waiting.
 */

import { useEffect, useState } from "react"
import ChroniclesLogo from "./ChroniclesLogo.jsx"
import "./ViewTransition.css"

/**
 * Plays the incoming view in whenever `viewKey` changes.
 *
 * The `key` is the whole mechanism: React tears the old wrapper down and
 * mounts a new one, so the CSS animation restarts from its first frame. No
 * state, no timers, and — the reason it is written this way — no chance of the
 * loop that holding the children in state produces, where every render creates
 * a new children object, which sets state, which renders again.
 *
 * Only the entrance is animated. Holding the outgoing view on screen for a
 * beat needs two copies of a page mounted at once, which for a view that
 * fetches on mount means two rounds of requests for one navigation; and the
 * exit half of a 300ms transition is the half nobody notices.
 */
export default function ViewTransition({ viewKey, children }) {
  return (
    <div className="view-transition" key={viewKey}>
      {children}
    </div>
  )
}

/**
 * The waiting state: flowing lines, drawn.
 *
 * `label` is announced to screen readers; the lines are decorative. `delay`
 * exists so that a request that resolves in 80ms never shows anything at all.
 */
export function ViewLoader({ label = "Loading…", delay = 220, fullScreen = false }) {
  const [visible, setVisible] = useState(delay === 0)

  useEffect(() => {
    if (delay === 0) return undefined
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  if (!visible) return null

  const loader = (
    <div className="view-loader view-transition" role="status" aria-live="polite">
      {fullScreen && <ChroniclesLogo size={40} className="view-loader-logo" />}
      <svg className="view-loader-flow" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-20 70 C60 20 120 100 200 50 S320 10 420 60" />
        <path d="M-20 40 C70 95 140 10 230 55 S340 90 420 30" />
        <path d="M-20 92 C90 48 160 104 250 40 S350 84 420 52" />
      </svg>
      <span className="view-loader-label">{label}</span>
    </div>
  )

  return fullScreen ? <div className="view-loader-screen">{loader}</div> : loader
}

/**
 * A block of placeholder rows, for lists whose shape is known before their
 * contents are.
 *
 * Better than a spinner in exactly one way, and it is the way that matters:
 * the page does not jump when the data lands, because the space was already
 * the right size.
 */
export function SkeletonRows({ rows = 3, height = 74, label = "Loading" }) {
  return (
    <div className="skeleton-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          className="skeleton-row"
          style={{ height: `${height}px`, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  )
}
