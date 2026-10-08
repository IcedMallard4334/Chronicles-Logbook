import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/** The size of the screen a walkthrough is filmed on. Whatever size the video is shown at, the app inside it is laid out at this. */
export const SCENE_WIDTH = 1200
export const SCENE_HEIGHT = 750

const KEPT_APART = "data-walkthrough-copy"

/** Every stylesheet the page has, copied into the frame, so the app inside it is dressed exactly as the app is. */
function copyStyles(from, to) {
  to.head.querySelectorAll(`[${KEPT_APART}]`).forEach((node) => node.remove())
  from.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    const copy = node.cloneNode(true)
    copy.setAttribute(KEPT_APART, "")
    to.head.appendChild(copy)
  })
  const fixed = to.createElement("style")
  fixed.setAttribute(KEPT_APART, "")
  fixed.textContent = "html, body { margin: 0; overflow: hidden; }"
  to.head.appendChild(fixed)
}

/** The person's theme and colours (carried on the page's root element), so the video follows them. */
function copyTheme(from, to) {
  const carries = (name) => name === "style" || name.startsWith("data-")
  for (const { name } of [...to.documentElement.attributes]) if (carries(name)) to.documentElement.removeAttribute(name)
  for (const { name, value } of [...from.documentElement.attributes]) if (carries(name)) to.documentElement.setAttribute(name, value)
}

/**
 * A screen inside the page: a frame laid out at a fixed size with the app's own stylesheets, drawn with
 * the app's own components. It is a real frame (not a scaled box) because the app's layout answers to the
 * width of the screen it is on; in a frame it answers to this one, however small the video is shown, so a
 * walkthrough looks the same on a phone as on a desktop.
 */
export default function WalkthroughFrame({ scale = 1, onDocument, children }) {
  const frame = useRef(null)
  const [target, setTarget] = useState(null)

  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc) return
    if (!doc.getElementById("root")) {
      doc.open()
      doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>')
      doc.close()
    }
    copyStyles(document, doc)
    copyTheme(document, doc)
    setTarget(doc.getElementById("root"))
    onDocument?.(doc)
    // The frame is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follows the page: its theme when that changes, and stylesheets that are added as it loads.
  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!target || !doc || typeof MutationObserver === "undefined") return undefined
    const theme = new MutationObserver(() => copyTheme(document, doc))
    theme.observe(document.documentElement, { attributes: true })
    let waiting = null
    const styles = new MutationObserver(() => {
      clearTimeout(waiting)
      waiting = setTimeout(() => copyStyles(document, doc), 150)
    })
    styles.observe(document.head, { childList: true })
    return () => {
      theme.disconnect()
      styles.disconnect()
      clearTimeout(waiting)
    }
  }, [target])

  return (
    <>
      <iframe
        ref={frame}
        title="A picture of Chronicles"
        className="wt-iframe"
        tabIndex={-1}
        style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT, transform: `scale(${scale})` }}
      />
      {target && createPortal(children, target)}
    </>
  )
}
