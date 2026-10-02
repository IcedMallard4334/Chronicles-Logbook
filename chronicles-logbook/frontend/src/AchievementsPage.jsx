import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { AchievementSummary, BadgeDialog, FILTERS } from "./AchievementParts"
import { fetchAchievements } from "./api"
import BadgeArt, { TIER_LABELS } from "./BadgeArt"
import "./Achievements.css"
import "./Dropdowns.css"
import "./Motion.css"
import "./MobileLayout.css"

/** Every badge, grouped by area, to open and read about. */
export default function AchievementsPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("all")
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let active = true
    fetchAchievements()
      .then((data) => { if (active) setSummary(data) })
      .catch(() => { if (active) setError("Could not load your badges.") })
    return () => { active = false }
  }, [])

  const groups = useMemo(() => {
    if (!summary) return []
    const visible = summary.badges.filter((badge) =>
      filter === "all" ? true : filter === "earned" ? badge.earned : !badge.earned
    )
    return Object.entries(summary.by_category)
      .map(([key, category]) => ({ key, name: category.name, badges: visible.filter((badge) => badge.category === key) }))
      .filter((group) => group.badges.length > 0)
  }, [summary, filter])

  return (
    <main className="achievements-page">
      <header className="achievements-page-header">
        <button type="button" className="btn-secondary" onClick={() => navigate("/profile")}>
          <span aria-hidden="true">‹</span> Back to profile
        </button>
        <h1>Your badges</h1>
        <p>Milestones you have reached in Chronicles. Open any badge to see what it celebrates and how to earn it.</p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {!summary && !error && <p className="hint" role="status">Loading your badges…</p>}

      {summary && (
        <>
          <AchievementSummary summary={summary} />

          <div className="achievement-filters" role="group" aria-label="Show badges">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "is-selected" : ""}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {groups.length === 0 && <p className="hint">Nothing here yet. Keep going!</p>}
          {groups.map((group) => (
            <section key={group.key} className="achievement-group" aria-label={group.name}>
              <h2>{group.name}</h2>
              <ul className="achievement-grid">
                {group.badges.map((badge) => (
                  <li key={badge.key}>
                    <button
                      type="button"
                      className={`badge-tile ${badge.earned ? "is-earned" : "is-locked"}`}
                      aria-label={`${badge.name}, ${TIER_LABELS[badge.tier]}, ${badge.earned ? "earned" : `${badge.progress} of ${badge.target}`}`}
                      onClick={() => setOpen(badge)}
                    >
                      <BadgeArt badge={badge} size={84} />
                      <span className="badge-tile-name">{badge.name}</span>
                      <span className="badge-tile-note">{badge.earned ? TIER_LABELS[badge.tier] : `${badge.progress}/${badge.target}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {open && <BadgeDialog badge={open} onClose={() => setOpen(null)} />}
    </main>
  )
}
