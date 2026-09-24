import { useEffect, useLayoutEffect, useRef } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus management for a dialog or popover (US-3.19): moves focus in when
 * it opens, closes on Escape, and returns focus to whatever had it before
 * opening. Traps Tab within the dialog by default — pass `trap: false` for
 * a non-modal popover (no backdrop, no aria-modal) that should stay
 * reachable from the rest of the page, like a notification list.
 *
 * The return-focus step is best-effort, the same way a native <dialog>
 * element's is: if the element that opened this dialog unmounted in the
 * same render that opened it (a toggle button replaced by the dialog,
 * rather than left in place beside it), there is nothing left to return
 * focus to, and it silently no-ops rather than throwing.
 *
 * `onClose`/`trap` are read from a ref updated every render, rather than
 * being effect dependencies, on purpose: every call site here passes a
 * fresh inline function, and depending on it directly would re-run the
 * open/focus/listen effect (and so re-steal focus onto the first field) on
 * every keystroke inside the dialog, not just when it actually opens.
 */
export function useDialogFocus(isOpen, onClose, { trap = true } = {}) {
  const containerRef = useRef(null)
  const previouslyFocused = useRef(null)
  const latest = useRef({ onClose, trap })

  useLayoutEffect(() => {
    latest.current = { onClose, trap }
  })

  useEffect(() => {
    if (!isOpen) return undefined
    previouslyFocused.current = document.activeElement

    const container = containerRef.current
    const focusable = container ? [...container.querySelectorAll(FOCUSABLE)] : []
    ;(focusable[0] || container)?.focus()

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        latest.current.onClose?.()
        return
      }
      if (!latest.current.trap || event.key !== "Tab" || !container) return

      const items = [...container.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previouslyFocused.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose/trap read from `latest`, deliberately not deps; see comment above.
  }, [isOpen])

  return containerRef
}
