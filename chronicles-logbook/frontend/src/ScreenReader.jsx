import { useEffect, useRef, useState } from "react"

import {
  accessibleName, describeElement, isFocusable, isHeading, KEYBOARD_HELP, normalise, readableItems, stateWords,
} from "./readerDescribe"
import {
  clampRate, READER_EVENT, readAloudSupported, readerRate, screenReaderEnabled, setReaderRate, setScreenReaderEnabled,
  speak, stopSpeaking,
} from "./speech"
import "./ScreenReader.css"

const LIVE = '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
const TEXT_FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=color]):not([type=range]):not([type=file]),textarea"

/**
 * A screen reader for Chronicles: it says what you land on, what changes, and lets
 * you move through the page without a mouse. It is for people who can't see the
 * screen, so it does more than read text out: it names each control, says what kind
 * of thing it is and what state it is in, announces dialogs, alerts and new pages,
 * and echoes what you type.
 *
 * It speaks with the browser's own voice, so it needs no install and sends nothing
 * anywhere. A full screen reader such as NVDA, JAWS or VoiceOver will do more for
 * someone who depends on one every day; this one is here so Chronicles can be used
 * straight away, on any computer, and it leaves the page's own markup alone so those
 * keep working too.
 */
export default function ScreenReader() {
  const [enabled, setEnabled] = useState(screenReaderEnabled)
  const rate = useRef(readerRate())

  useEffect(() => {
    const sync = (event) => {
      if (typeof event.detail?.enabled === "boolean") setEnabled(event.detail.enabled)
      if (typeof event.detail?.rate === "number") rate.current = event.detail.rate
    }
    window.addEventListener(READER_EVENT, sync)
    return () => window.removeEventListener(READER_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!enabled || !readAloudSupported()) return undefined

    const say = (text, { queue = false } = {}) => {
      const words = normalise(text)
      if (words) speak(words, { rate: rate.current, queue })
    }

    let cursor = null
    let lastDialog = null
    let lastHeading = document.querySelector("h1")?.textContent?.trim() || ""
    let quietFocus = false
    const lastLive = new WeakMap()
    let pending = new Set()
    let flush = null

    const markCursor = (el) => {
      cursor?.classList.remove("sr-cursor")
      cursor = el
      el?.classList.add("sr-cursor")
    }

    const onFocus = (event) => {
      const el = event.target
      if (!(el instanceof Element) || el === document.body || el === document.documentElement) return
      if (quietFocus) { quietFocus = false; return }
      markCursor(null)
      const dialog = el.closest('dialog, [role="dialog"], [role="alertdialog"]')
      let text = describeElement(el)
      if (dialog && dialog !== lastDialog) text = `Dialog, ${accessibleName(dialog)}. ${text}`
      lastDialog = dialog
      say(text)
    }

    const onClick = (event) => {
      const el = event.target instanceof Element ? event.target.closest('[aria-pressed],[aria-expanded],[aria-selected],[role=switch],input[type=checkbox],input[type=radio],summary') : null
      if (!el) return
      // After the page has reacted, say what the control now is.
      setTimeout(() => say(stateWords(el).join(", ") || describeElement(el)), 80)
    }

    const move = (direction) => {
      const items = readableItems(document)
      if (items.length === 0) return say("Nothing to read here.")
      const from = cursor && items.includes(cursor) ? cursor : document.activeElement
      let index = items.indexOf(from)
      if (index === -1) index = direction > 0 ? -1 : items.length
      const next = index + direction
      if (next < 0) return say("Top of page.")
      if (next >= items.length) return say("End of page.")
      go(items[next])
    }

    const go = (el) => {
      markCursor(el)
      el.scrollIntoView?.({ block: "center" })
      if (isFocusable(el)) {
        quietFocus = true
        el.focus({ preventScroll: true })
        // A focus that doesn't move (already there) raises no event to clear this.
        setTimeout(() => { quietFocus = false }, 0)
      }
      say(describeElement(el))
    }

    const nextHeading = (direction) => {
      const headings = readableItems(document).filter(isHeading)
      if (headings.length === 0) return say("No headings on this page.")
      const all = readableItems(document)
      const here = all.indexOf(cursor && all.includes(cursor) ? cursor : document.activeElement)
      const candidates = direction > 0 ? headings.filter((h) => all.indexOf(h) > here) : headings.filter((h) => all.indexOf(h) < here).reverse()
      if (candidates.length === 0) return say(direction > 0 ? "No more headings." : "No earlier headings.")
      go(candidates[0])
    }

    const readAll = () => {
      const items = readableItems(document)
      const here = items.indexOf(cursor && items.includes(cursor) ? cursor : document.activeElement)
      const rest = items.slice(here + 1, here + 201)
      if (rest.length === 0) return say("Nothing more to read.")
      stopSpeaking()
      rest.forEach((el) => speak(describeElement(el), { rate: rate.current, queue: true }))
    }

    const changeRate = (delta) => {
      const next = setReaderRate(clampRate(rate.current + delta))
      rate.current = next
      say(`Speed ${next.toFixed(1)}`)
    }

    const onKey = (event) => {
      if (event.key === "Escape" || (event.key === "Control" && !event.altKey && !event.shiftKey)) {
        stopSpeaking()
        return
      }
      if (event.altKey && event.shiftKey) {
        const actions = {
          ArrowDown: () => move(1),
          ArrowUp: () => move(-1),
          KeyH: () => nextHeading(1),
          KeyJ: () => nextHeading(-1),
          KeyR: readAll,
          KeyT: () => say(document.title || document.querySelector("h1")?.textContent || "No title"),
          Equal: () => changeRate(0.1),
          NumpadAdd: () => changeRate(0.1),
          Minus: () => changeRate(-0.1),
          NumpadSubtract: () => changeRate(-0.1),
          Slash: () => say(KEYBOARD_HELP),
        }
        const action = actions[event.code]
        if (action) {
          event.preventDefault()
          action()
        }
        return
      }
      // Typing is echoed a character at a time, as people who can't see the screen expect.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.target instanceof Element && event.target.matches(TEXT_FIELD)) {
        if (event.target.type === "password") say("star")
        else say(event.key === " " ? "space" : event.key)
      }
    }

    const speakLive = (region) => {
      if (region.getAttribute("aria-busy") === "true") return
      const text = normalise(region.textContent).slice(0, 300)
      if (!text || lastLive.get(region) === text) return
      lastLive.set(region, text)
      say(text, { queue: region.getAttribute("role") !== "alert" })
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const origin = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
        const region = origin?.closest?.(LIVE)
        if (region) pending.add(region)
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            if (node.matches(LIVE)) pending.add(node)
            node.querySelectorAll?.(LIVE).forEach((inner) => pending.add(inner))
          }
        })
      }
      clearTimeout(flush)
      flush = setTimeout(() => {
        const heading = document.querySelector("h1")?.textContent?.trim() || ""
        if (heading && heading !== lastHeading) {
          lastHeading = heading
          say(`Page, ${heading}`, { queue: true })
        }
        const regions = pending
        pending = new Set()
        regions.forEach(speakLive)
      }, 200)
    })

    document.addEventListener("focusin", onFocus)
    document.addEventListener("click", onClick, true)
    document.addEventListener("keydown", onKey, true)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    say(`Screen reader on. ${document.querySelector("h1")?.textContent?.trim() || ""} Press Alt Shift question mark for keyboard help.`)

    return () => {
      document.removeEventListener("focusin", onFocus)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("keydown", onKey, true)
      observer.disconnect()
      clearTimeout(flush)
      markCursor(null)
      stopSpeaking()
    }
  }, [enabled])

  if (!enabled || !readAloudSupported()) return null

  return (
    <div className="sr-badge" role="group" aria-label="Screen reader">
      <span aria-hidden="true">🔊</span>
      <span>Screen reader on</span>
      <button type="button" onClick={() => setScreenReaderEnabled(false)}>Turn off</button>
    </div>
  )
}
