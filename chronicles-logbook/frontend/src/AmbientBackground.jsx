/**
 * The backdrop, which follows whichever accent the workspace is set to.
 *
 * Each accent gets a scene rather than a wash: forest light through a canopy,
 * deep water, drifting petals, folded violet. They are drawn here rather than
 * shipped as photographs, for three reasons that all point the same way — a
 * photograph is a megabyte the app has to load before it looks like anything,
 * it cannot follow a colour change without a second copy of every file, and it
 * crops badly between a phone and an ultrawide. Layered gradients cost nothing,
 * read the accent's own custom properties, and stretch to any shape.
 *
 * Everything is deliberately soft and dim: this sits behind real work, and a
 * backdrop that competes with an entry list is a backdrop that has to be
 * turned off. Dark mode dims further still — the same scene at dusk rather
 * than a different one.
 *
 * `prefers-reduced-motion` stops the drift entirely, in the stylesheet, so it
 * is honoured even if this component never re-renders.
 */

import { useEffect, useState } from "react"
import "./AmbientBackground.css"

/**
 * The accent currently in force, kept in step with the DOM.
 *
 * Preferences are written to `documentElement.dataset` by `applyPreferences`,
 * which the profile page calls as the radio buttons change. Watching the
 * attribute means the scene switches with the colour, in the same frame,
 * without preferences having to know a background exists.
 */
function useAccent() {
  const read = () =>
    document.documentElement.dataset.customGlow === "on"
      ? "custom"
      : document.documentElement.dataset.accent || "chronicles"
  const [accent, setAccent] = useState(read)

  useEffect(() => {
    const observer = new MutationObserver(() => setAccent(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-accent", "data-theme", "data-custom-glow"],
    })
    return () => observer.disconnect()
  }, [])

  return accent
}

/**
 * Forest: light coming down through leaves, with trunks behind it.
 *
 * The verticals are what make it read as woodland rather than as a green
 * gradient — a few of them, at uneven spacing, blurred until they are
 * suggestions.
 */
function ForestScene() {
  return (
    <>
      <div className="ambient-canopy" />
      <div className="ambient-trunks" />
      <div className="ambient-shafts" />
    </>
  )
}

/** Ocean: bands of deep water, paler as they rise, slowly swelling. */
function OceanScene() {
  return (
    <>
      <div className="ambient-depth" />
      <svg className="ambient-swell" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,300 C260,220 460,380 760,310 S1180,240 1440,330 L1440,900 L0,900 Z" />
        <path className="is-mid" d="M0,430 C300,360 520,500 820,430 S1220,370 1440,450 L1440,900 L0,900 Z" />
        <path className="is-near" d="M0,580 C280,520 560,650 860,580 S1240,530 1440,600 L1440,900 L0,900 Z" />
      </svg>
      <div className="ambient-foam" />
    </>
  )
}

/**
 * Rose: petals caught mid-fall.
 *
 * Generated rather than hand-placed so the arrangement does not read as a
 * repeating pattern, and seeded off the index so it is the same arrangement on
 * every render — a backdrop that reshuffles when the page re-renders is a
 * backdrop somebody notices.
 */
function RoseScene() {
  const petals = Array.from({ length: 18 }, (_, index) => {
    const seed = (index * 2654435761) % 1000
    return {
      id: index,
      left: (seed % 97) + (index * 5.1) % 90,
      top: (seed % 89) + (index * 3.7) % 80,
      size: 16 + (seed % 26),
      tilt: (seed % 180) - 90,
      delay: -(seed % 24),
      depth: index % 3,
    }
  })

  return (
    <>
      <div className="ambient-bloom" />
      <div className="ambient-petals" aria-hidden="true">
        {petals.map((petal) => (
          <span
            key={petal.id}
            className={`ambient-petal is-depth-${petal.depth}`}
            style={{
              left: `${petal.left % 96}%`,
              top: `${petal.top % 88}%`,
              width: `${petal.size}px`,
              height: `${petal.size * 0.62}px`,
              transform: `rotate(${petal.tilt}deg)`,
              animationDelay: `${petal.delay}s`,
            }}
          />
        ))}
      </div>
    </>
  )
}

/** Chronicles: folded violet planes, the sharpest of the four. */
function ChroniclesScene() {
  return (
    <>
      <div className="ambient-aurora" />
      <svg className="ambient-folds" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,0 620,0 300,900 0,760" />
        <polygon className="is-light" points="520,0 1080,0 760,900 320,900" />
        <polygon className="is-deep" points="960,0 1440,0 1440,900 780,900" />
        <polygon className="is-edge" points="0,620 720,300 1440,700 1440,900 0,900" />
      </svg>
    </>
  )
}

/**
 * Your own colour: the same folded planes as the default scene, but drawn from
 * the glow colour you chose (and two neighbours of it), so the soft light in the
 * background is yours rather than a preset's.
 */
function CustomScene() {
  return (
    <>
      <div className="ambient-glow" />
      <svg className="ambient-glow-folds" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="0,0 620,0 300,900 0,760" />
        <polygon className="is-light" points="520,0 1080,0 760,900 320,900" />
        <polygon className="is-deep" points="960,0 1440,0 1440,900 780,900" />
        <polygon className="is-edge" points="0,620 720,300 1440,700 1440,900 0,900" />
      </svg>
    </>
  )
}

const SCENES = {
    custom: CustomScene,
  chronicles: ChroniclesScene,
  ocean: OceanScene,
  forest: ForestScene,
  rose: RoseScene,
}

export default function AmbientBackground() {
  const accent = useAccent()
  const Scene = SCENES[accent] || ChroniclesScene

  return (
    <div className={`ambient ambient-${accent}`} aria-hidden="true">
      <Scene />
      {/* Over the scene, never under it: the veil is what keeps text legible,
          and it has to dim whatever the scene happens to put behind a word. */}
      <div className="ambient-veil" />
      <div className="ambient-grain" />
    </div>
  )
}
