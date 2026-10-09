import BadgeArt, { TIER_LABELS } from "./BadgeArt"
import { useDialogFocus } from "./useDialogFocus"
import "./Achievements.css"

export const TIER_ORDER = ["bronze", "silver", "gold", "legendary", "platinum"]
export const FILTERS = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "locked", label: "To earn" },
]

const RING = 52
const CIRCUMFERENCE = 2 * Math.PI * RING

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })

export function ProgressRing({ earned, total }) {
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

export function Bar({ label, earned, total, className = "" }) {
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

export function BadgeDialog({ badge, onClose }) {
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

/** The ring plus the rarity and area bars. */
export function AchievementSummary({ summary }) {
  return (
    <div className="achievement-summary">
      <ProgressRing earned={summary.earned} total={summary.total} />
      <div className="achievement-breakdown">
        <h2>By rarity</h2>
        {TIER_ORDER.filter((tier) => summary.by_tier[tier]).map((tier) => (
          <Bar key={tier} label={TIER_LABELS[tier]} earned={summary.by_tier[tier].earned} total={summary.by_tier[tier].total} className={`tier-${tier}`} />
        ))}
      </div>
      <div className="achievement-breakdown">
        <h2>By area</h2>
        {Object.entries(summary.by_category).map(([key, category]) => (
          <Bar key={key} label={category.name} earned={category.earned} total={category.total} />
        ))}
      </div>
    </div>
  )
}
