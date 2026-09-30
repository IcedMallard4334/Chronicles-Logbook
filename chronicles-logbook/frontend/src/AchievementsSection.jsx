import { useEffect, useMemo, useState } from "react"

import { fetchAchievements } from "./api"
import BadgeArt, { TIER_LABELS } from "./BadgeArt"
import { useDialogFocus } from "./useDialogFocus"
import "./Achievements.css"

const TIER_ORDER = ["bronze", "silver", "gold", "legendary"]
const FILTERS = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "locked", label: "To earn" },
]

const RING = 52
const CIRCUMFERENCE = 2 * Math.PI * RING

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })

function ProgressRing({ earned, total }) {
  const fraction = total ? earned / total : 0
  return (
    <div className="achievement-ring" role="img" aria-label={`${earned} of ${total} badges earned`}>
      <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
        <circle cx="60" cy="60" r={RING} fill="none" stroke="var(--line, rgba(127,127,127,.3))" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={RING}
          fill="none"
          stroke="var(--blue, #6b5bff)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="achievement-ring-label">
        <strong>{earned}</strong>
        <span>of {total}</span>
      </div>
    </div>
  )
}

function Bar({ label, earned, total, className = "" }) {
  const percent = total ? Math.round((earned / total) * 100) : 0
  return (
    <div className={`achievement-bar ${className}`.trim()}>
      <span className="achievement-bar-label">{label}</span>
      <span
        className="achievement-bar-track"
        role="img"
        aria-label={`${label}: ${earned} of ${total}`}
      >
        <span className="achievement-bar-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="achievement-bar-count">{earned}/{total}</span>
    </div>
  )
}

function BadgeDialog({ badge, onClose }) {
  const dialogRef = useDialogFocus(true, onClose)
  const percent = Math.round((badge.progress / badge.target) * 100)
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card badge-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-dialog-title"
        tabIndex={-1}
      >
        <BadgeArt badge={badge} size={150} />
        <h2 id="badge-dialog-title">{badge.name}</h2>
        <p className="achievement-tier">{TIER_LABELS[badge.tier]} · {badge.category_name}</p>
        <p>{badge.blurb}</p>
        <dl className="badge-dialog-facts">
          <div><dt>How to earn it</dt><dd>{badge.how}</dd></div>
          <div>
            <dt>{badge.earned ? "Earned" : "Progress"}</dt>
            <dd>
              {badge.earned ? (
                <time dateTime={badge.earned_at}>{formatDate(badge.earned_at)}</time>
              ) : (
                <>
                  <span className="achievement-bar-track" role="img" aria-label={`${badge.progress} of ${badge.target}`}>
                    <span className="achievement-bar-fill" style={{ width: `${percent}%` }} />
                  </span>
                  <span>{badge.progress} of {badge.target}</span>
                </>
              )}
            </dd>
          </div>
        </dl>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/** The badges section of the profile: a summary, then every badge to open and read about. */
export default function AchievementsSection() {
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

  // Arriving from a celebration ("See all my badges") should land on this section.
  useEffect(() => {
    if (summary && window.location.hash === "#achievements") {
      document.getElementById("achievements")?.scrollIntoView?.({ behavior: "smooth", block: "start" })
    }
  }, [summary])

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
    <section className="profile-section achievements" id="achievements" aria-labelledby="achievements-title">
      <h2 id="achievements-title">Achievements</h2>

      {error && <p className="error" role="alert">{error}</p>}
      {!summary && !error && <p className="hint" role="status">Loading your badges…</p>}

      {summary && (
        <>
          <div className="achievement-summary">
            <ProgressRing earned={summary.earned} total={summary.total} />
            <div className="achievement-breakdown">
              <h3>By rarity</h3>
              {TIER_ORDER.map((tier) => (
                <Bar key={tier} label={TIER_LABELS[tier]} earned={summary.by_tier[tier].earned} total={summary.by_tier[tier].total} className={`tier-${tier}`} />
              ))}
            </div>
            <div className="achievement-breakdown">
              <h3>By area</h3>
              {Object.entries(summary.by_category).map(([key, category]) => (
                <Bar key={key} label={category.name} earned={category.earned} total={category.total} />
              ))}
            </div>
          </div>

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
            <div key={group.key} className="achievement-group">
              <h3>{group.name}</h3>
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
            </div>
          ))}
        </>
      )}

      {open && <BadgeDialog badge={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
