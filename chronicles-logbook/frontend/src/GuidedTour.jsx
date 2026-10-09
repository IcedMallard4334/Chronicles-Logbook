/**
 * The guided tour: a spotlight walkthrough on the first sign-in, and a single
 * coach mark the first time each page is opened.
 *
 * The rule the whole thing is built on is that guidance arrives when somebody
 * is already looking at the thing being explained. A tour that front-loads
 * nine screens before you have seen the app teaches nothing, because there is
 * nothing yet to attach it to. So the welcome tour is four steps about where
 * things are, and everything else waits until the page it describes is open.
 *
 * Positioning is measured from the real element rather than declared in CSS:
 * the nav is a pill that wraps at narrow widths and the sidebar disappears
 * entirely on a phone, so where a card belongs is only knowable at the moment
 * it is shown. A step whose anchor is not on screen is skipped — an arrow
 * pointing at nothing is worse than no arrow at all.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { markTourSeen } from "./tourSteps"
import "./GuidedTour.css"

const MARGIN = 14
const CARD_WIDTH = 340

/**
 * Where to put the card, given what it is pointing at.
 *
 * Below the anchor by preference, above it when there is no room below, and
 * centred when there is no anchor. Clamped to the viewport on both axes, so a
 * card attached to something at the very edge of a phone screen still lands
 * fully on screen.
 */
function placeCard(rect, viewport) {
  if (!rect) {
    return {
      style: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
      side: "center",
    }
  }

  const below = viewport.height - rect.bottom
  const side = below > 240 || below > rect.top ? "below" : "above"

  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, MARGIN),
    Math.max(viewport.width - CARD_WIDTH - MARGIN, MARGIN)
  )

  const top =
    side === "below" ? rect.bottom + MARGIN : Math.max(rect.top - MARGIN, MARGIN)

  return {
    style: {
      top: `${top}px`,
      left: `${left}px`,
      transform: side === "above" ? "translateY(-100%)" : "none",
    },
    side,
  }
}

function useAnchorRect(selector, step) {
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null)
      return undefined
    }

    const measure = () => {
      const element = document.querySelector(selector)
      if (!element) {
        setRect(null)
        return
      }
      const box = element.getBoundingClientRect()
      // Zero-sized means present in the DOM but not laid out — a collapsed
      // sidebar, say. Treated as absent, which makes the step skippable.
      setRect(box.width && box.height ? box : null)
    }

    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [selector, step])

  return rect
}

/** One card, spotlighting one element. */
function TourCard({
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
  viewport,
  compact = false,
}) {
  const rect = useAnchorRect(step.anchor, index)
  const { style, side } = placeCard(rect, viewport)
  const cardRef = useRef(null)

  // Focus moves to the card so the whole thing is keyboard-operable from the
  // moment it appears, and Escape always gets out.
  useEffect(() => {
    cardRef.current?.focus()
  }, [index])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onSkip()
      if (event.key === "ArrowRight") onNext()
      if (event.key === "ArrowLeft" && onBack) onBack()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onNext, onBack, onSkip])

  return (
    <>
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: `${rect.top - 8}px`,
            left: `${rect.left - 8}px`,
            width: `${rect.width + 16}px`,
            height: `${rect.height + 16}px`,
          }}
          aria-hidden="true"
        />
      )}
      <div
        ref={cardRef}
        className={`tour-card is-${side} ${compact ? "is-compact" : ""}`}
        style={style}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-card-title"
        tabIndex={-1}
      >
        <div className="tour-card-body">
          <h2 id="tour-card-title">{step.title}</h2>
          <p>{step.body}</p>
        </div>
        <div className="tour-card-foot">
          {total > 1 ? (
            <span className="tour-progress" role="img" aria-label={`Step ${index + 1} of ${total}`}>
              {Array.from({ length: total }, (_, dot) => (
                <span key={dot} className={dot === index ? "is-current" : ""} />
              ))}
            </span>
          ) : (
            <span />
          )}
          <span className="tour-card-actions">
            <button type="button" className="tour-skip" onClick={onSkip}>
              {total > 1 && index < total - 1 ? "Skip" : "Got it"}
            </button>
            {total > 1 && index > 0 && (
              <button type="button" className="tour-back" onClick={onBack}>
                Back
              </button>
            )}
            {total > 1 && (
              <button type="button" className="tour-next" onClick={onNext}>
                {step.cta || (index === total - 1 ? "Done" : "Next")}
              </button>
            )}
          </span>
        </div>
      </div>
    </>
  )
}

function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    const measure = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  return viewport
}

/**
 * The multi-step welcome tour.
 *
 * `onFinish` fires however it ends — completed, skipped or escaped — because
 * from the app's point of view those are the same event: this person has been
 * offered the tour and should not be offered it again.
 */
export function WelcomeTour({ tour, onFinish }) {
  const viewport = useViewport()
  const [index, setIndex] = useState(0)

  // Steps whose anchor has gone missing — a narrow window with no sidebar —
  // are dropped rather than shown pointing at nothing.
  const steps = tour.steps.filter(
    (step) => !step.anchor || document.querySelector(step.anchor)
  )

  const finish = useCallback(() => {
    markTourSeen(tour.id)
    onFinish()
  }, [tour.id, onFinish])

  if (steps.length === 0) return null

  const step = steps[Math.min(index, steps.length - 1)]

  return (
    <div className="tour-layer">
      <div className="tour-scrim" onClick={finish} role="presentation" />
      <TourCard
        step={step}
        index={index}
        total={steps.length}
        viewport={viewport}
        onNext={() => (index >= steps.length - 1 ? finish() : setIndex(index + 1))}
        onBack={() => setIndex(Math.max(index - 1, 0))}
        onSkip={finish}
      />
    </div>
  )
}

/**
 * A single coach mark for a page being opened for the first time.
 *
 * Deliberately not modal and with no scrim: this arrives while somebody is
 * already doing something, and blocking the page to explain the page would be
 * its own small insult.
 */
export function PageHint({ hint, onDismiss }) {
  const viewport = useViewport()

  const finish = useCallback(() => {
    markTourSeen(hint.id)
    onDismiss()
  }, [hint.id, onDismiss])

  return (
    <div className="tour-layer is-hint">
      <TourCard
        step={{ ...hint, anchor: hint.anchor || null }}
        index={0}
        total={1}
        viewport={viewport}
        onNext={finish}
        onBack={null}
        onSkip={finish}
        compact
      />
    </div>
  )
}
