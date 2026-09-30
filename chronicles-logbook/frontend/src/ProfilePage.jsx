import { signOut } from "./api"
import LogoIcon from "./ChroniclesLogo"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { deleteAccount, fetchCurrentUser } from "./api"
import { ACCENTS, applyPreferences } from "./preferences"
import { pageReaderEnabled, readAloudSupported, setPageReaderEnabled } from "./speech"
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
  const [pageReader, setPageReader] = useState(pageReaderEnabled)
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
                  <span className="profile-row-label">Page reader</span>
                  <span className="profile-row-value">
                    {readAloudSupported()
                      ? "Adds a Read this page button that speaks the page aloud, or just the text you've selected."
                      : "Your browser doesn't support reading aloud."}
                  </span>
                </div>
                <div className="density-toggle" role="group" aria-label="Page reader">
                  <button type="button" className={pageReader ? "" : "is-selected"} aria-pressed={!pageReader} disabled={!readAloudSupported()} onClick={() => { setPageReader(false); setPageReaderEnabled(false) }}>Off</button>
                  <button type="button" className={pageReader ? "is-selected" : ""} aria-pressed={pageReader} disabled={!readAloudSupported()} onClick={() => { setPageReader(true); setPageReaderEnabled(true) }}>On</button>
                </div>
              </div>
            </section>

            <section className="profile-section">
              <h2>Workspace settings</h2>
              <div className="profile-row">
                <div className="profile-row-text">
                  <span className="profile-row-label">Accent colour</span>
                  <span className="profile-row-value">Choose the colour used for controls and focus states.</span>
                </div>
                <select className="profile-select" value={accent} onChange={(event) => updateAccent(event.target.value)} aria-label="Accent colour">
                  {ACCENTS.map(option => <option key={option.id} value={option.id}>{option.name}{option.recommended ? " — Recommended" : ""}</option>)}
                </select>
              </div>
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
