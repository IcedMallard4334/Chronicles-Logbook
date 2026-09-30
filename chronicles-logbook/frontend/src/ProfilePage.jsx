import { signOut } from "./api"
import LogoIcon from "./ChroniclesLogo"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { deleteAccount, fetchCurrentUser } from "./api"
import { ACCENTS, applyPreferences, clearAccentCustoms, hasAccentCustoms, readCustomColors, saveCustomColors } from "./preferences"
import AchievementsSection from "./AchievementsSection"
import { readAloudSupported, readerRate, screenReaderEnabled, setReaderRate, setScreenReaderEnabled } from "./speech"
import { resetTours } from "./tourSteps"
import { useDialogFocus } from "./useDialogFocus"
import "./App.css"
import "./ProfilePage.css"
import { TrashIcon } from "./TrashIcon"

function formatError(error) {
  return error instanceof Error ? error.message : "Something went wrong."
}



function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "system"
    return window.localStorage.getItem("chronicles-theme") || "system"
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === "system") {
      delete root.dataset.theme
    } else {
      root.dataset.theme = theme
    }
    window.localStorage.setItem("chronicles-theme", theme)
  }, [theme])

  const cycleTheme = () => {
    const themes = ["light", "dark", "system"]
    setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length])
  }

  return [theme, cycleTheme]
}

function useDensity() {
  const [density, setDensity] = useState(() => window.localStorage.getItem("chronicles-density") || "comfortable")
  useEffect(() => {
    document.documentElement.dataset.density = density
    window.localStorage.setItem("chronicles-density", density)
  }, [density])
  return [density, setDensity]
}

function DeleteAccountModal({ onClose, onConfirm, error, isDeleting, confirmation, setConfirmation }) {
  // Always mounted only while it should be shown (the parent renders it
  // conditionally), so isOpen is just "true, for as long as this exists".
  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-card delete-account-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="profile-delete-account-description profile-delete-account-warning"
        tabIndex={-1}
      >
        <LogoIcon size={90} />
        <h2 id="delete-account-title">Delete your account?</h2>
        <p id="profile-delete-account-description">This will permanently delete your Chronicles account and all of its projects, entries, and tasks.</p>
        <p id="profile-delete-account-warning" className="delete-warning">This action cannot be undone.</p>
        <label className="field-label full">
          Type <strong>DELETE</strong> to confirm
          <input
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE"
            disabled={isDeleting}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button
            type="button"
            className="delete-account-confirm"
            onClick={onConfirm}
            disabled={confirmation !== "DELETE" || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [theme, cycleTheme] = useTheme()
  const [density, setDensity] = useDensity()
  const [screenReader, setScreenReader] = useState(screenReaderEnabled)
  const [speed, setSpeed] = useState(readerRate)
  const [custom, setCustom] = useState(readCustomColors)
  // Advanced opens by itself if any of its pieces is already in use.
  const [colourMode, setColourMode] = useState(() => {
    const saved = readCustomColors()
    return saved.controls || saved.second || saved.glow || saved.background ? "advanced" : "basic"
  })
  const changeCustom = (key, value) => {
    const next = { ...custom, [key]: value }
    // The basic accent and the separate pieces are two ways of saying the same
    // thing, so using one starts from a clean slate for the other.
    if (key === "accent") Object.assign(next, { controls: null, second: null, glow: null })
    setCustom(next)
    saveCustomColors(next)
  }
  const resetCustom = () => {
    const empty = { accent: null, controls: null, second: null, glow: null, background: null }
    setCustom(empty)
    saveCustomColors(empty)
  }
  // What the page is using right now, so a picker opens on the colour you can see.
  const currentColour = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  }
  const [accent, setAccent] = useState(() => window.localStorage.getItem("chronicles-accent") || "chronicles")
  const [startView, setStartView] = useState(() => window.localStorage.getItem("chronicles-start-view") || "home")
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const loadUser = useCallback(async () => {
    try {
      const cached = window.localStorage.getItem("chronicles_user")
      if (cached) {
        try {
          setUser(JSON.parse(cached))
        } catch {
          setUser(null)
        }
      }
      const data = await fetchCurrentUser()
      setUser(data)
      window.localStorage.setItem("chronicles_user", JSON.stringify(data))
      setLoadError(null)
    } catch (error) {
      setLoadError(formatError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const clearSession = () => { signOut().catch(() => {}) }

  const handleSignOut = () => {
    clearSession()
  }

  // The tour marks itself seen in localStorage as it's dismissed; forgetting
  // that here and returning to the workspace is what makes it "replayable"
  // rather than a one-time-only offer (US-3.23).
  const replayTour = () => {
    resetTours()
    navigate("/app")
  }

  const openDeleteModal = () => {
    setDeleteError("")
    setConfirmation("")
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return
    setConfirmation("")
    setShowDeleteModal(false)
  }

  const handleDelete = async () => {
    if (confirmation !== "DELETE") return
    setIsDeleting(true)
    setDeleteError("")
    try {
      await deleteAccount()
      clearSession()
    } catch (error) {
      setDeleteError(formatError(error))
      setIsDeleting(false)
    }
  }

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?"

  const themeLabel = theme.charAt(0).toUpperCase() + theme.slice(1)
  const updateAccent = (nextAccent) => {
    setAccent(nextAccent)
    window.localStorage.setItem("chronicles-accent", nextAccent)
    // Choosing a preset replaces any colour of your own (a custom background stays).
    if (hasAccentCustoms(custom)) {
      clearAccentCustoms()
      setCustom(readCustomColors())
    }
    applyPreferences({ theme, accent: nextAccent, density })
  }
  const updateStartView = (nextStartView) => {
    setStartView(nextStartView)
    window.localStorage.setItem("chronicles-start-view", nextStartView)
  }

  return (
    <div className="app-shell">
      <div className="app-bg-dynamic" aria-hidden="true">
        <div className="app-bg-sky" />
        <div className="app-bg-waves">
          <svg className="wave wave-back" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-mid" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,256L48,245.3C96,235,192,213,288,202.7C384,192,480,192,576,208C672,224,768,256,864,261.3C960,267,1056,245,1152,229.3C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-front" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,288L48,282.7C96,277,192,267,288,245.3C384,224,480,192,576,197.3C672,203,768,245,864,261.3C960,277,1056,267,1152,250.7C1248,235,1344,213,1392,202.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>
        <div className="app-bg-grid" />
      </div>

      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-pill-left">
            <button
              type="button"
              className="nav-item profile-back"
              onClick={() => navigate("/app")}
              aria-label="Back to workspace"
            >
              {/* An SVG rather than a text arrow: below 520px the nav hides
                  every span inside a nav-item, which used to hide the arrow
                  too and leave this button blank on a phone. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>
            <button type="button" className="nav-item" onClick={() => navigate("/app")}>
              <LogoIcon size={30} />
              <span className="brand-name">Chronicles</span>
            </button>
          </div>
          <div className="nav-pill-right">
            <div className="account-actions">
              <div className="user-avatar" title={user?.full_name || "User"}>
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  initials
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main className="app-main profile-main">
        <div className="profile-card view-transition">
          <div className="profile-header">
            <div className="profile-avatar">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
              ) : (
                initials
              )}
            </div>
            <div className="profile-titles">
              <h1>{loading ? "Loading…" : user?.full_name || "Profile"}</h1>
              <p className="profile-email">{user?.email || " "}</p>
            </div>
          </div>

          {loadError && (
            <div className="global-error" role="alert">
              <p>{loadError}</p>
            </div>
          )}

          <div className="profile-sections">
            <section className="profile-section">
              <h2>Appearance</h2>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Theme</span>
                  <span className="profile-row-value">{themeLabel}</span>
                </div>
                <button type="button" className="btn-secondary" onClick={cycleTheme}>
                  Switch theme
                </button>
              </div>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Workspace density</span>
                  <span className="profile-row-value">{density === "compact" ? "Compact — more information on screen" : "Comfortable — extra breathing room"}</span>
                </div>
                <div className="density-toggle" role="group" aria-label="Workspace density">
                  <button type="button" className={density === "comfortable" ? "is-selected" : ""} onClick={() => setDensity("comfortable")}>Comfortable</button>
                  <button type="button" className={density === "compact" ? "is-selected" : ""} onClick={() => setDensity("compact")}>Compact</button>
                </div>
              </div>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Accent colour</span>
                  <span className="profile-row-value">Choose the colour used for controls and focus states.</span>
                </div>
                <select className="profile-select" value={accent} onChange={(event) => updateAccent(event.target.value)} aria-label="Accent colour">
                  {ACCENTS.map(option => <option key={option.id} value={option.id}>{option.name}{option.recommended ? " — Recommended" : ""}</option>)}
                </select>
              </div>
              <div className="profile-row profile-colours">
                <div className="profile-row-text">
                  <span className="profile-row-label">Your own colours</span>
                  <span className="profile-row-value">
                    {colourMode === "basic"
                      ? "Pick one colour to replace the preset's: buttons, highlights, and the soft glow in the background all follow it."
                      : "Set the pieces one at a time. A custom page background replaces Light and Dark until you reset it."}
                  </span>
                </div>
                <div className="colour-controls">
                  <div className="density-toggle" role="group" aria-label="Colour options">
                    <button type="button" className={colourMode === "basic" ? "is-selected" : ""} aria-pressed={colourMode === "basic"} onClick={() => setColourMode("basic")}>Basic</button>
                    <button type="button" className={colourMode === "advanced" ? "is-selected" : ""} aria-pressed={colourMode === "advanced"} onClick={() => setColourMode("advanced")}>Advanced</button>
                  </div>
                  <div className="colour-pickers">
                    {colourMode === "basic" ? (
                      <label className="colour-picker">
                        <span>Your colour</span>
                        <input type="color" aria-label="Custom accent colour" value={custom.accent || currentColour("--blue", "#5b5ce2")} onChange={(event) => changeCustom("accent", event.target.value)} />
                      </label>
                    ) : (
                      <>
                        <label className="colour-picker">
                          <span>Buttons and highlights</span>
                          <input type="color" aria-label="Buttons and highlights" value={custom.controls || custom.accent || currentColour("--blue", "#5b5ce2")} onChange={(event) => changeCustom("controls", event.target.value)} />
                        </label>
                        <label className="colour-picker">
                          <span>Second colour</span>
                          <input type="color" aria-label="Second colour" value={custom.second || currentColour("--mauve", "#7653c8")} onChange={(event) => changeCustom("second", event.target.value)} />
                        </label>
                        <label className="colour-picker">
                          <span>Page glow</span>
                          <input type="color" aria-label="Page glow" value={custom.glow || custom.accent || currentColour("--blue", "#5b5ce2")} onChange={(event) => changeCustom("glow", event.target.value)} />
                        </label>
                        <label className="colour-picker">
                          <span>Page background</span>
                          <input type="color" aria-label="Page background" value={custom.background || currentColour("--bg", "#12141a")} onChange={(event) => changeCustom("background", event.target.value)} />
                        </label>
                      </>
                    )}
                    <button type="button" className="btn-secondary" disabled={!Object.values(custom).some(Boolean)} onClick={resetCustom}>
                      Reset colours
                    </button>
                  </div>
                </div>
              </div>
              <div className="profile-row profile-screen-reader">
                <div className="profile-row-text">
                  <span className="profile-row-label">Screen reader</span>
                  <span className="profile-row-value">
                    {readAloudSupported()
                      ? "Speaks each control as you reach it, announces dialogs, alerts and new pages, echoes what you type, and lets you move around the page from the keyboard."
                      : "Your browser doesn't support speech."}
                  </span>
                  {readAloudSupported() && (
                    <details className="screen-reader-help">
                      <summary>Keyboard shortcuts</summary>
                      <ul>
                        <li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd>: move between controls; each is read as you arrive</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd>: next / previous item on the page</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> / <kbd>J</kbd>: next / previous heading</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>: read on from where you are</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>: read the page title</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>+</kbd> / <kbd>-</kbd>: faster / slower</li>
                        <li><kbd>Esc</kbd> or <kbd>Ctrl</kbd>: stop speaking</li>
                        <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>?</kbd>: hear these again</li>
                      </ul>
                    </details>
                  )}
                </div>
                <div className="colour-controls">
                  <div className="density-toggle" role="group" aria-label="Screen reader">
                    <button type="button" className={screenReader ? "" : "is-selected"} aria-pressed={!screenReader} disabled={!readAloudSupported()} onClick={() => { setScreenReader(false); setScreenReaderEnabled(false) }}>Off</button>
                    <button type="button" className={screenReader ? "is-selected" : ""} aria-pressed={screenReader} disabled={!readAloudSupported()} onClick={() => { setScreenReader(true); setScreenReaderEnabled(true) }}>On</button>
                  </div>
                  <label className="colour-picker">
                    <span>Speaking speed</span>
                    <select className="profile-select" aria-label="Speaking speed" value={speed} disabled={!readAloudSupported()} onChange={(event) => setSpeed(setReaderRate(event.target.value))}>
                      {[0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2].map((value) => <option key={value} value={value}>{value === 1 ? "Normal" : `${value}×`}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            <AchievementsSection />

            <section className="profile-section">
              <h2>Workspace settings</h2>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Default opening page</span>
                  <span className="profile-row-value">Choose where Chronicles opens after sign-in.</span>
                </div>
                <select className="profile-select" value={startView} onChange={(event) => updateStartView(event.target.value)} aria-label="Default opening page">
                  <option value="home">Home workspace</option><option value="today">Today</option><option value="calendar">Calendar</option>
                </select>
              </div>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Guided tour</span>
                  <span className="profile-row-value">See the welcome tour and every page's first-visit tip again.</span>
                </div>
                <button type="button" className="btn-secondary" onClick={replayTour}>
                  Replay tour
                </button>
              </div>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Help manual</span>
                  <span className="profile-row-value">Search how-to guides for every feature and field type.</span>
                </div>
                <button type="button" className="btn-secondary" onClick={() => navigate("/help")}>
                  Open help
                </button>
              </div>
            </section>

            <section className="profile-section">
              <h2>Session</h2>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Sign out</span>
                  <span className="profile-row-value">You can sign back in anytime.</span>
                </div>
                <button type="button" className="btn-secondary" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </section>

            <section className="profile-section profile-danger-zone">
              <h2>Danger zone</h2>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Delete account</span>
                  <span className="profile-row-value">Permanently delete your account and all data.</span>
                </div>
                <button type="button" className="delete-account-confirm btn-trash-inline" onClick={openDeleteModal}>
                  <TrashIcon /> Delete account
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={closeDeleteModal}
          onConfirm={handleDelete}
          error={deleteError}
          isDeleting={isDeleting}
          confirmation={confirmation}
          setConfirmation={setConfirmation}
        />
      )}
    </div>
  )
}
