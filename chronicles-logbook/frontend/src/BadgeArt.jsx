import { useId } from "react"

// One badge, drawn as a hexagon whose colour is its tier, with a glyph for its
// category. A badge not yet earned is drawn in grey with a ring showing how far
// along it is.

export const TIER_LABELS = { bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary", platinum: "Platinum" }

const TIER_COLOURS = {
  bronze: ["#f0b27a", "#a05a2c"],
  silver: ["#f4f6fb", "#8d97a8"],
  gold: ["#ffe27a", "#c78a00"],
  legendary: ["#3ee7ff", "#9b5cff", "#ff5ca8"],
  platinum: ["#ffffff", "#bfe6ff", "#9fb4e8", "#e9d5ff"],
}

const STARS = { bronze: 1, silver: 2, gold: 3, legendary: 4, platinum: 5 }

// Simple line glyphs on a 24 x 24 grid.
const GLYPHS = {
  projects: <><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M6 3v16" /></>,
  entries: <><path d="M12 20h9" /><path d="M16.5 3.5l4 4L8 20l-5 1 1-5z" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  login: <path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" />,
  activity: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  tasks: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  explorer: <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" />,
  // A trophy: cup, handles, stem and base.
  mastery: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" /><path d="M12 14v4M8.5 20h7" /></>,
}

const HEXAGON = "M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z"
const RING_RADIUS = 47
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function BadgeArt({ badge, size = 96, className = "" }) {
  const id = useId().replace(/:/g, "")
  const colours = TIER_COLOURS[badge.tier] || TIER_COLOURS.bronze
  const earned = badge.earned
  const fraction = badge.target ? Math.min(badge.progress / badge.target, 1) : 0
  const stars = STARS[badge.tier] || 1

  return (
    <svg
      className={`badge-art badge-art-${badge.tier} ${earned ? "is-earned" : "is-locked"} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          {colours.map((colour, index) => (
            <stop key={colour} offset={colours.length === 1 ? 0 : index / (colours.length - 1)} stopColor={colour} />
          ))}
        </linearGradient>
      </defs>
      <path d={HEXAGON} fill={earned ? `url(#${id}-fill)` : "var(--badge-locked, #c7ccd6)"} stroke="rgba(0,0,0,0.25)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 12 L83 31 L83 69 L50 88 L17 69 L17 31 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      {!earned && (
        <>
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="3" />
          <circle
            className="badge-art-progress"
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--blue, #6b5bff)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
            transform="rotate(-90 50 50)"
          />
        </>
      )}
      <g transform="translate(32 28) scale(1.5)" fill="none" stroke={earned ? "#fff" : "rgba(0,0,0,0.35)"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[badge.category] || GLYPHS.explorer}
      </g>
      <g fill={earned ? "#fff" : "rgba(0,0,0,0.3)"}>
        {Array.from({ length: stars }, (_, index) => (
          <circle key={index} cx={50 + (index - (stars - 1) / 2) * 9} cy="79" r="2.6" />
        ))}
      </g>
    </svg>
  )
}
