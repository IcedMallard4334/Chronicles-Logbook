import { useEffect, useState } from "react"

import { fetchStreaks, recordStreakActivity, STREAKS_CHANGED } from "./api"
import { TipBubble } from "./Tip"
import "./Streaks.css"

/** The streak marks as line icons, so they take the theme's colours instead of an emoji's own. */
export function StreakIcon({ kind, size = 16 }) {
  return (
    <svg className={`streak-icon is-${kind}`} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      {kind === "login"
        ? <path d="M12 2.5s5.5 4.2 5.5 9.6a5.5 5.5 0 0 1-11 0c0-2.2 1.1-3.6 2.2-4.6.1 2 1 3.2 2.1 3.4C10.3 7.6 10.3 5 12 2.5z" />
        : <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" />}
    </svg>
  )
}

const KINDS = [
  {
    key: "login",
    name: "Login streak",
    help: "Consecutive days you have opened Chronicles.",
    nudge: "Opened today’s logbook to keep it going.",
  },
  {
    key: "interaction",
    name: "Activity streak",
    help: "Consecutive days you did something: logged an entry, completed a task, created a project or ran an activity.",
    nudge: "Do something today to keep it going.",
  },
]

let loggedInToday = null

function dayLabel(count) {
  return `${count} ${count === 1 ? "day" : "days"}`
}

/** The two daily streaks, in the header. */
export default function Streaks() {
  const [streaks, setStreaks] = useState(null)

  useEffect(() => {
    let active = true
    const show = (next) => { if (active) setStreaks(next) }
    const onChange = (event) => show(event.detail)
    window.addEventListener(STREAKS_CHANGED, onChange)

    const today = new Date().toDateString()
    const load = loggedInToday === today ? fetchStreaks() : recordStreakActivity("login").then((result) => { loggedInToday = today; return result })
    load.then(show).catch(() => {
      // Streaks are a nicety; a failure must never get in the way of the app.
    })

    return () => {
      active = false
      window.removeEventListener(STREAKS_CHANGED, onChange)
    }
  }, [])

  if (!streaks) return null

  return (
    <ul className="streaks" aria-label="Daily streaks">
      {KINDS.map(({ key, name, help, nudge }) => {
        const streak = streaks[key]
        const alive = streak.current > 0
        const tip = `${name}: ${dayLabel(streak.current)}. Longest: ${dayLabel(streak.longest)}. ${help} ${streak.active_today ? "Done for today." : nudge}`
        return (
          // Focusable so the tip is reachable from a keyboard and by tapping; the sr-only text is what a
          // screen reader reads, and the visible bubble is hidden from it so it is not read twice.
          <li key={key} className={`streak has-tip ${alive ? "is-alive" : ""} ${streak.active_today ? "is-done" : ""}`} tabIndex={0}>
            <StreakIcon kind={key} />
            <span className="streak-count">{streak.current}</span>
            <span className="sr-only">{tip}</span>
            <TipBubble text={tip} align="end" />
          </li>
        )
      })}
    </ul>
  )
}
