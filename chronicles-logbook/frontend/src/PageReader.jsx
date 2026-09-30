import { useEffect, useRef, useState } from "react"

import { pageReaderEnabled, READER_EVENT, readAloudSupported, speak } from "./speech"
import "./PageReader.css"

function textToRead() {
  const selection = window.getSelection?.().toString().trim()
  if (selection) return selection
  const main = document.querySelector("main") || document.body
  return main.innerText || main.textContent || ""
}

/** An opt-in control (Profile → Accessibility) that reads the page aloud. */
export default function PageReader() {
  const [enabled, setEnabled] = useState(pageReaderEnabled)
  const [state, setState] = useState("idle")
  const session = useRef(null)

  useEffect(() => {
    const sync = (event) => setEnabled(typeof event.detail === "boolean" ? event.detail : pageReaderEnabled())
    window.addEventListener(READER_EVENT, sync)
    return () => window.removeEventListener(READER_EVENT, sync)
  }, [])

  const stop = () => {
    session.current?.stop()
    session.current = null
    setState("idle")
  }

  useEffect(() => {
    if (!enabled) stop()
    return () => session.current?.stop()
  }, [enabled])

  if (!enabled || !readAloudSupported()) return null

  const start = () => {
    session.current = speak(textToRead(), { onEnd: () => setState("idle"), onError: () => setState("idle") })
    setState("reading")
  }
  const togglePause = () => {
    if (state === "reading") { session.current?.pause(); setState("paused") }
    else { session.current?.resume(); setState("reading") }
  }

  return (
    <div className="page-reader" role="group" aria-label="Page reader">
      {state === "idle" ? (
        <button type="button" className="page-reader-button" onClick={start}>
          <span aria-hidden="true">🔊</span> Read this page
        </button>
      ) : (
        <>
          <button type="button" className="page-reader-button" onClick={togglePause}>
            {state === "reading" ? "Pause" : "Resume"}
          </button>
          <button type="button" className="page-reader-button" onClick={stop}>Stop</button>
        </>
      )}
    </div>
  )
}
