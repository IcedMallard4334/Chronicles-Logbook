import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { AchievementSummary } from "./AchievementParts"
import { fetchAchievements } from "./api"
import "./Achievements.css"

/** The profile's view of badges: how you are doing, and a way to see them all. */
export default function AchievementsSection() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchAchievements()
      .then((data) => { if (active) setSummary(data) })
      .catch(() => { if (active) setError("Could not load your badges.") })
    return () => { active = false }
  }, [])

  return (
    <section className="profile-section achievements" id="achievements" aria-labelledby="achievements-title">
      <div className="achievements-heading">
        <h2 id="achievements-title">Achievements</h2>
        <Link className="btn-secondary achievements-link" to="/achievements">View all badges</Link>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!summary && !error && <p className="hint" role="status">Loading your badges…</p>}
      {summary && <AchievementSummary summary={summary} />}
    </section>
  )
}
