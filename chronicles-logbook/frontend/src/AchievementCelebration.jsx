import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { ACTIVITY_EVENT, fetchAchievements, markAchievementsSeen, STREAKS_CHANGED } from "./api"
import BadgeArt, { TIER_LABELS } from "./BadgeArt"
import Confetti from "./Confetti"
import { useDialogFocus } from "./useDialogFocus"
import "./Achievements.css"

const SETTLE_MS = 1200

/**
 * Watches for badges being earned and celebrates each one with confetti.
 *
 * It asks the server after anything that saves something, and after signing in
 * (which can complete a streak), a moment after the activity has settled so a
 * flurry of saves is one check. The server is the one that decides a badge is
 * earned and whether its celebration has been shown, so this never has to
 * remember anything itself.
 */
export default function AchievementCelebration() {
  const [queue, setQueue] = useState([])
  const [burst, setBurst] = useState(0)
  const timer = useRef(null)
  const alive = useRef(true)
  const navigate = useNavigate()
  const current = queue[0] || null

  const check = useCallback(async () => {
    try {
      const summary = await fetchAchievements()
      const fresh = (summary?.badges || []).filter((badge) => badge.is_new)
      if (!alive.current || fresh.length === 0) return
      setQueue((existing) => {
        const known = new Set(existing.map((badge) => badge.key))
        return [...existing, ...fresh.filter((badge) => !known.has(badge.key))]
      })
    } catch {
      // A celebration is a nicety; a failed check must never get in the way.
    }
  }, [])

  const scheduleCheck = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(check, SETTLE_MS)
  }, [check])

  useEffect(() => {
    alive.current = true
    scheduleCheck()
    window.addEventListener(ACTIVITY_EVENT, scheduleCheck)
    window.addEventListener(STREAKS_CHANGED, scheduleCheck)
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      window.removeEventListener(ACTIVITY_EVENT, scheduleCheck)
      window.removeEventListener(STREAKS_CHANGED, scheduleCheck)
    }
  }, [scheduleCheck])

  // Each new badge it is shown for gets its own burst.
  useEffect(() => {
    if (current) setBurst((count) => count + 1)
  }, [current?.key])

  const dismiss = useCallback(() => {
    if (!current) return
    markAchievementsSeen([current.key]).catch(() => {})
    setQueue((existing) => existing.slice(1))
  }, [current])

  const dialogRef = useDialogFocus(Boolean(current), dismiss)

  if (!current) return null

  const remaining = queue.length - 1
  return (
    <>
      <Confetti key={burst} big={current.tier === "platinum"} />
      <div className="modal-backdrop achievement-backdrop" role="presentation">
        <div
          ref={dialogRef}
          className="modal-card achievement-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="achievement-title"
          aria-describedby="achievement-blurb"
          tabIndex={-1}
        >
          <p className="achievement-kicker">Achievement unlocked</p>
          <BadgeArt badge={current} size={168} className="achievement-pop" />
          <h2 id="achievement-title">{current.name}</h2>
          <p className="achievement-tier">{TIER_LABELS[current.tier]} · {current.category_name}</p>
          <p id="achievement-blurb">{current.blurb}</p>
          {remaining > 0 && <p className="hint">{remaining} more to see after this one.</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                dismiss()
                navigate("/achievements")
              }}
            >
              See all my badges
            </button>
            <button type="button" className="btn-primary" onClick={dismiss}>
              {remaining > 0 ? "Next" : "Nice!"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
