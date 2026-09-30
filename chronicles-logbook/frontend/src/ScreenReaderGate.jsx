import { Suspense, lazy, useEffect, useState } from "react"

// The screen reader is only for people who turn it on, so none of its code
// should be downloaded by everyone else: this small gate is all the landing page
// loads, and the reader itself arrives only once it is switched on.
const ScreenReader = lazy(() => import("./ScreenReader"))

const KEY = "chronicles-screen-reader"
const EVENT = "chronicles-screen-reader-change"

const isOn = () => {
  try {
    return window.localStorage.getItem(KEY) === "on"
  } catch {
    return false
  }
}

export default function ScreenReaderGate() {
  const [on, setOn] = useState(isOn)

  useEffect(() => {
    const sync = (event) => {
      if (typeof event.detail?.enabled === "boolean") setOn(event.detail.enabled)
    }
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  // Once loaded it stays mounted, so it can show its own "turn off" control and
  // keep its listeners; it renders nothing when it is off.
  return on ? (
    <Suspense fallback={null}>
      <ScreenReader />
    </Suspense>
  ) : null
}
