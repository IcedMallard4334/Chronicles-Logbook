import { useEffect, useRef } from "react"

const COLOURS = ["#ff5ca8", "#ffd23f", "#3ee7ff", "#9b5cff", "#4ade80", "#ff8a3d"]
const PIECES = 170
const DURATION = 3400
const GRAVITY = 0.16

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Pieces shot up from the two bottom corners, with a fan falling from the top middle. */
export function makePieces(width, height, random = Math.random, total = PIECES) {
  return Array.from({ length: total }, (_, index) => {
    const source = index % 3 // 0: left cannon, 1: right cannon, 2: top fan
    const speed = 8 + random() * 9
    let x = 0
    let y = height
    let vx
    let vy
    if (source === 2) {
      const angle = random() * Math.PI
      x = width / 2
      y = height * 0.15
      vx = Math.cos(angle) * speed * 0.6
      vy = Math.sin(angle) * speed * 0.3
    } else {
      const base = -0.8 - random() * 0.6 // up and inwards
      const angle = source === 0 ? base : -Math.PI - base
      x = source === 0 ? 0 : width
      vx = Math.cos(angle) * speed
      vy = Math.sin(angle) * speed
    }
    return {
      x,
      y,
      vx,
      vy,
      size: 6 + random() * 7,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 0.4,
      colour: COLOURS[Math.floor(random() * COLOURS.length)],
      round: random() > 0.75,
    }
  })
}

/** A burst of confetti across the whole window. Draws nothing for people who asked for less motion. */
export default function Confetti({ onDone, big = false }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      onDone?.()
      return undefined
    }
    const canvas = canvasRef.current
    let context = null
    try {
      context = canvas?.getContext?.("2d") || null
    } catch {
      context = null
    }
    if (!canvas || !context) {
      onDone?.()
      return undefined
    }

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const pieces = makePieces(canvas.width, canvas.height, Math.random, big ? PIECES * 3 : PIECES)
    const started = performance.now()
    let frame = 0

    const draw = (now) => {
      const elapsed = now - started
      context.clearRect(0, 0, canvas.width, canvas.height)
      const fade = Math.max(0, Math.min(1, (DURATION - elapsed) / 900))
      for (const piece of pieces) {
        piece.vy += GRAVITY
        piece.vx *= 0.992
        piece.x += piece.vx
        piece.y += piece.vy
        piece.rotation += piece.spin
        context.save()
        context.globalAlpha = fade
        context.translate(piece.x, piece.y)
        context.rotate(piece.rotation)
        context.fillStyle = piece.colour
        if (piece.round) {
          context.beginPath()
          context.arc(0, 0, piece.size / 2, 0, Math.PI * 2)
          context.fill()
        } else {
          context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
        }
        context.restore()
      }
      if (elapsed < DURATION) frame = requestAnimationFrame(draw)
      else onDone?.()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
    // The burst is one-shot: it should not restart if the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
}
