// Icons for the navigation, drawn on one 24px grid with the same stroke so they read as a set.

const props = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
}

/** A pulse line: what has been happening. */
export function ActivityIcon() {
  return (
    <svg {...props}>
      <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
    </svg>
  )
}

/** A calendar page with today marked. */
export function TodayIcon() {
  return (
    <svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <rect x="8" y="13" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A clipboard with unticked lines: what is still waiting. */
export function OutstandingIcon() {
  return (
    <svg {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <path d="M8 12h.01M8 16h.01M12 12h4M12 16h4" />
    </svg>
  )
}

/** Columns of cards of different heights: work laid out by stage. */
export function BoardIcon() {
  return (
    <svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18" />
      <path d="M5.5 7h1M11.5 7h1M17.5 7h1M11.5 11h1M17.5 11h1M17.5 15h1" />
    </svg>
  )
}
