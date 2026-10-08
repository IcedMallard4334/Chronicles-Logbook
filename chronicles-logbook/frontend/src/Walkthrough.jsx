import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { WALKTHROUGHS, clock, stateAt, transcript } from "./walkthroughs"
import WalkthroughFrame, { SCENE_WIDTH } from "./WalkthroughFrame"
import { SCENES } from "./WalkthroughScenes"
import "./Walkthrough.css"

/**
 * A short silent video of how something is done, played from a script rather than recorded.
 *
 * It starts paused, never plays on its own, and has the controls a video has: play and pause, replay,
 * and a bar to move through it. The captions are the narration, and the same words are available as
 * text underneath for anyone who would rather read them.
 */
export default function Walkthrough({ id }) {
  const script = WALKTHROUGHS[id]
  const Scene = SCENES[id]
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState({ x: 600, y: 420 })
  const [scale, setScale] = useState(0.4)
  const [screen, setScreen] = useState(null)
  const stage = useRef(null)
  const lastScreen = useRef(null)
  const clockRef = useRef({ last: 0 })
  const duration = script?.duration ?? 0

  const state = script ? stateAt(script, time) : null

  // Time moves while playing, and stops itself at the end.
  useEffect(() => {
    if (!playing) return undefined
    let frame
    clockRef.current.last = performance.now()
    const tick = (now) => {
      const elapsed = (now - clockRef.current.last) / 1000
      clockRef.current.last = now
      setTime((current) => {
        const next = current + elapsed
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration])

  // The picture is laid out at a fixed size and shrunk to fit, so it looks the same at any size.
  useLayoutEffect(() => {
    const root = stage.current
    if (!root) return undefined
    const fit = () => root.clientWidth && setScale(root.clientWidth / SCENE_WIDTH)
    fit()
    if (typeof ResizeObserver === "undefined") return undefined
    const watcher = new ResizeObserver(fit)
    watcher.observe(root)
    return () => watcher.disconnect()
  }, [])

  // The cursor goes to whatever the current step points at, measured where it really is in the app. A
  // target further down a panel than fits is scrolled into view first, as a person would, and the cursor
  // goes to where it will be once the scroll has finished.
  useLayoutEffect(() => {
    if (!screen || !state?.target) return
    const element = /^[.[#]/.test(state.target) ? screen.querySelector(state.target) : screen.querySelector(`[data-target="${state.target}"]`)
    if (!element) return
    // A different page starts at the top, wherever the last one was left.
    const page = screen.scrollingElement
    const picture = `${state.values.screen}|${state.values.saved}`
    if (lastScreen.current !== picture) {
      page?.scrollTo?.({ top: 0, behavior: "instant" })
      lastScreen.current = picture
    }
    const box = element.getBoundingClientRect()
    let shift = 0
    const scroller = element.closest(".drawer-body")
    const middle = box.top + box.height / 2
    if (scroller) {
      const view = scroller.getBoundingClientRect()
      if (middle < view.top + view.height * 0.12 || middle > view.bottom - view.height * 0.12) {
        shift = middle - (view.top + view.height / 2)
        scroller.scrollTo?.({ top: scroller.scrollTop + shift, behavior: "smooth" })
      }
    } else if (page && (middle > page.clientHeight * 0.88 || middle < page.clientHeight * 0.12)) {
      shift = Math.max(middle - page.clientHeight / 2, -page.scrollTop)
      page.scrollTo?.({ top: page.scrollTop + shift, behavior: "smooth" })
    }
    setCursor({ x: box.left + Math.min(box.width * 0.5, 110), y: box.top - shift + box.height * 0.55 })
    // Moves when the step changes, not on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state?.target, state?.step, state?.values?.drawer, state?.values?.screen, state?.values?.saved, state?.values?.extraField])

  const toggle = useCallback(() => {
    if (time >= duration) setTime(0)
    setPlaying((value) => !value)
  }, [time, duration])

  if (!script || !Scene) return null

  const atEnd = time >= duration
  const started = time > 0

  return (
    <figure className="walkthrough" aria-label={`Walkthrough: ${script.title}`}>
      <div className="wt-frame">
        <div className="wt-stage" ref={stage} aria-hidden="true">
          <WalkthroughFrame scale={scale} onDocument={setScreen}>
            <Scene values={state.values} cursor={{ ...cursor, clicking: state.clicking }} />
          </WalkthroughFrame>
        </div>
        {state.caption && <figcaption className="wt-caption" aria-live="off">{state.caption}</figcaption>}
        {!started && !playing && (
          <button type="button" className="wt-poster" onClick={toggle} aria-label={`Play the walkthrough: ${script.title}`}>
            <span className="wt-play" aria-hidden="true">▶</span>
            <strong>{script.title}</strong>
            <small>About a minute · no sound · captions on screen</small>
          </button>
        )}
      </div>

      <div className="wt-controls">
        <button type="button" className="wt-control" onClick={toggle} aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}>
          {playing ? "❚❚" : atEnd ? "↻" : "▶"}
        </button>
        <input
          type="range"
          className="wt-scrub"
          min={0}
          max={duration}
          step={0.1}
          value={time}
          onChange={(event) => setTime(Number(event.target.value))}
          aria-label="Position in the walkthrough"
          aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        />
        <span className="wt-time" aria-hidden="true">{clock(time)} / {clock(duration)}</span>
      </div>

      <details className="wt-transcript">
        <summary>Read it instead</summary>
        <ol>
          {transcript(script).map((line) => <li key={line.at}>{line.text}</li>)}
        </ol>
      </details>
    </figure>
  )
}
