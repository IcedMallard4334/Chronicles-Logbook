import "./LearningCardArt.css"

/**
 * The illustrated banner on a Learning Chronicles card — flat shapes and a
 * colour wash, in the same spirit as AmbientBackground.jsx's accent scenes,
 * rather than a photo or a stock illustration. A handful of scenes are
 * shared across the ten chronicles (`learningContent.js` picks one per
 * chronicle by name) so the set reads as one family rather than ten
 * unrelated graphics — the same reason AmbientBackground has four scenes,
 * not one per page.
 *
 * Everything here is `aria-hidden`: the card's title and description, not
 * the picture beside them, are what a screen reader needs.
 */

/** An open book with a couple of lines across each page — a concept to read. */
function PagesScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <path className="is-base" d="M80 28C66 20 40 16 24 18v70c16-2 42 2 56 10Z" />
      <path className="is-light" d="M80 28c14-8 40-12 56-10v70c-16-2-42 2-56 10Z" />
      <path className="is-line" d="M34 36h30M34 48h26M34 60h30" />
      <path className="is-line is-right" d="M96 36h30M100 48h26M96 60h30" />
    </svg>
  )
}

/** An upward shape with trailing arcs — starting something. */
function LaunchScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <path className="is-base" d="M80 14 100 56 80 50 60 56Z" />
      <path className="is-trail" d="M58 92c10-10 54-10 64 0" />
      <path className="is-trail is-far" d="M44 104c22-18 70-18 92 0" />
      <circle className="is-dot" cx="36" cy="30" r="3.5" />
      <circle className="is-dot is-small" cx="128" cy="44" r="2.5" />
      <circle className="is-dot is-small" cx="118" cy="20" r="2" />
    </svg>
  )
}

/** Three overlapping rounded blocks — building something out of parts. */
function BuildScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <rect className="is-base" x="30" y="46" width="52" height="52" rx="12" />
      <rect className="is-light" x="78" y="30" width="52" height="52" rx="12" />
      <rect className="is-line" x="54" y="66" width="52" height="52" rx="12" fill="none" />
    </svg>
  )
}

/** A dotted path across the frame — a history building over time. */
function TimelineScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <path className="is-trail" d="M20 88c20 4 32-30 52-28s26 30 48 24 14-36 20-36" />
      <circle className="is-dot" cx="20" cy="88" r="5" />
      <circle className="is-dot is-light" cx="72" cy="60" r="5" />
      <circle className="is-dot" cx="120" cy="84" r="5" />
      <circle className="is-dot is-light" cx="140" cy="48" r="6" />
    </svg>
  )
}

/** A compass face — exploring what's possible. */
function CompassScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <circle className="is-ring" cx="80" cy="60" r="38" />
      <circle className="is-light" cx="80" cy="60" r="30" />
      <path className="is-needle" d="M80 34 90 60 80 86 70 60Z" />
      <circle className="is-dot" cx="80" cy="60" r="3" />
    </svg>
  )
}

/** A sparkle with a few small dots around it — a tip, or value adding up. */
function SparkScene() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true">
      <path className="is-base" d="M80 24c3 16 8 21 24 24-16 3-21 8-24 24-3-16-8-21-24-24 16-3 21-8 24-24Z" />
      <circle className="is-dot" cx="122" cy="34" r="4" />
      <circle className="is-dot is-light" cx="36" cy="80" r="5" />
      <circle className="is-dot is-small" cx="128" cy="78" r="2.5" />
    </svg>
  )
}

const SCENES = {
  pages: PagesScene,
  launch: LaunchScene,
  build: BuildScene,
  timeline: TimelineScene,
  compass: CompassScene,
  spark: SparkScene,
}

export default function LearningCardArt({ scene, wash = "blue" }) {
  const Scene = SCENES[scene] || PagesScene

  return (
    <div className={`learning-art is-wash-${wash}`}>
      <Scene />
    </div>
  )
}
