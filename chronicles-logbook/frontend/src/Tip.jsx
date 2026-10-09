import "./Tip.css"

/**
 * Our own tooltip, in place of the browser's `title` bubble.
 *
 * A `title` tooltip is drawn by the browser: plain white, unthemed, slow to appear, impossible to reach from a
 * keyboard or a phone, and it ignores the chosen theme and accent. This one is drawn in the app's own palette,
 * appears on hover and on keyboard focus, and goes away when the control it describes opens something.
 *
 * Put `has-tip` on the element and a `<TipBubble>` inside it. The bubble is hidden from assistive technology
 * (`aria-hidden`) because the element already carries its own accessible name or text; saying it twice would
 * make a screen reader read it twice. `align="end"` anchors the bubble's right edge to the element's, for
 * controls near the right of the window, where a centred bubble would run off the screen.
 */
export function TipBubble({ text, align = "center" }) {
  return (
    <span className={`tip-bubble is-${align}`} aria-hidden="true">
      {text}
    </span>
  )
}
