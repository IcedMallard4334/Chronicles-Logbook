// Icons for Learning Chronicles, drawn on the same 24px grid and stroke as
// NavIcons.jsx so a chronicle card reads as part of the app, not a separate
// illustration style. Keyed by string id so content in learningContent.js
// can reference an icon by name without importing a component directly —
// a new chronicle just needs an icon added here once, then referenced by id.

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

/** An open book: understanding a concept. */
function BookIcon() {
  return (
    <svg {...props}>
      <path d="M4 5.5C4 4.67 4.67 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </svg>
  )
}

/** A pencil: writing an entry. */
function PencilIcon() {
  return (
    <svg {...props}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path d="M14.5 5.5l3 3" />
    </svg>
  )
}

/** A flag: starting something. */
function FlagIcon() {
  return (
    <svg {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </svg>
  )
}

/** Puzzle piece: structuring/designing something. */
function PuzzleIcon() {
  return (
    <svg {...props}>
      <path d="M9 4h4a1 1 0 0 1 1 1v2.1a1.9 1.9 0 1 0 0 3.8V13a1 1 0 0 1-1 1h-2.1a1.9 1.9 0 1 1-3.8 0H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.1a1.9 1.9 0 1 0 3.8 0V5a1 1 0 0 1-1-1Z" />
    </svg>
  )
}

/** A clock with a trailing arc: history building over time. */
function HistoryIcon() {
  return (
    <svg {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  )
}

/** A compass: exploring use cases. */
function CompassIcon() {
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.2l-2 5.6-5.6 2 2-5.6Z" />
    </svg>
  )
}

/** Overlapping shapes: comparing this tool to others. */
function LayersIcon() {
  return (
    <svg {...props}>
      <polygon points="12 3 21 8 12 13 3 8 12 3" />
      <polyline points="3 13 12 18 21 13" />
    </svg>
  )
}

/** A rising trend: getting more value over time. */
function TrendingUpIcon() {
  return (
    <svg {...props}>
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  )
}

/** A checklist: tips and best practices. */
function ChecklistIcon() {
  return (
    <svg {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  )
}

/** A spark/star: a tip worth highlighting, or the value that adds up over time. */
function SparkIcon() {
  return (
    <svg {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A flask: research and experiments. */
function FlaskIcon() {
  return (
    <svg {...props}>
      <path d="M9 3h6M10 3v6.2L4.6 18.1A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.9L14 9.2V3" />
      <path d="M7.4 14.5h9.2" />
    </svg>
  )
}

/** A spanner: maintenance and repairs. */
function WrenchIcon() {
  return (
    <svg {...props}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.6 17.1a2 2 0 0 0 2.8 2.8l5.7-5.7a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" />
    </svg>
  )
}

/** Angle brackets: writing software. */
function CodeIcon() {
  return (
    <svg {...props}>
      <path d="M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  )
}

/** A dumbbell: training and fitness. */
function DumbbellIcon() {
  return (
    <svg {...props}>
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </svg>
  )
}

/** A map pin: fieldwork, work done somewhere. */
function MapPinIcon() {
  return (
    <svg {...props}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

export const LEARNING_ICONS = {
  book: BookIcon,
  pencil: PencilIcon,
  flag: FlagIcon,
  puzzle: PuzzleIcon,
  history: HistoryIcon,
  compass: CompassIcon,
  layers: LayersIcon,
  "trending-up": TrendingUpIcon,
  checklist: ChecklistIcon,
  spark: SparkIcon,
  flask: FlaskIcon,
  wrench: WrenchIcon,
  code: CodeIcon,
  dumbbell: DumbbellIcon,
  "map-pin": MapPinIcon,
}

/** Renders the icon named by `name`, falling back to the book icon. */
export default function LearningIcon({ name }) {
  const Icon = LEARNING_ICONS[name] || BookIcon
  return <Icon />
}
