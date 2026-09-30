import { useEffect, useState } from "react"

import { fetchStreaks, recordStreakActivity, STREAKS_CHANGED } from "./api"
import "./Streaks.css"

const KINDS = [
  {
    key: "login",
    icon: "🔥",
    name: "Login streak",
    help: "Consecutive days you have opened Chronicles.",
    nudge: "Opened today’s logbook to keep it going.",
  },
  {
    key: "interaction",
    icon: "⚡",
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
      {KINDS.map(({ key, icon, name, help, nudge }) => {
        const streak = streaks[key]
        const alive = streak.current > 0
        const tip = `${name}: ${dayLabel(streak.current)}. Longest: ${dayLabel(streak.longest)}. ${help} ${streak.active_today ? "Done for today." : nudge}`
        return (
          <li key={key} className={`streak ${alive ? "is-alive" : ""} ${streak.active_today ? "is-done" : ""}`} title={tip}>
            <span aria-hidden="true">{icon}</span>
            <span className="streak-count">{streak.current}</span>
            <span className="sr-only">{tip}</span>
          </li>
        )
      })}
    </ul>
  )
}
