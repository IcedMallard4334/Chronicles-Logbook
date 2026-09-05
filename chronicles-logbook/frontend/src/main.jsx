import { StrictMode, useEffect, useState } from 'react'
import { fetchCurrentUser, refreshSession } from './api'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthCallback from './AuthCallback.jsx'
import AuthPage from './AuthPage.jsx'
import ProfilePage from './ProfilePage.jsx'
import SetupPage from './SetupPage.jsx'
import { applyPreferences, readPreference } from './preferences'
import './ProfessionalDensity.css'

applyPreferences({
  theme: readPreference('theme', 'system'),
  accent: readPreference('accent', 'chronicles'),
  density: readPreference('density', 'comfortable'),
})

function SessionGate({ children }) {
  const [state, setState] = useState('loading')
  useEffect(() => {
    let active = true
    const ended = () => { window.location.assign('/?session=expired') }
    window.addEventListener('chronicles-session-ended', ended)
    async function restore() {
      try {
        if (!window.localStorage.getItem('chronicles_signed_out')) {
          if (window.localStorage.getItem('chronicles_token')) await fetchCurrentUser()
          else await refreshSession()
        }
        if (active) setState('ready')
      } catch (error) {
        if (error.status === 401) {
          window.localStorage.removeItem('chronicles_token')
          window.localStorage.removeItem('chronicles_user')
          if (active) setState('ready')
        } else if (active) setState('error')
      }
    }
    restore()
    return () => { active = false; window.removeEventListener('chronicles-session-ended', ended) }
  }, [])
  if (state === 'loading') return <main className="auth-callback-shell"><p role="status">Restoring your session…</p></main>
  if (state === 'error') return <main className="auth-callback-shell"><div><p>Cannot reach the server to restore your session.</p><button onClick={() => window.location.reload()}>Try again</button></div></main>
  return children
}

function LandingRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <Navigate to="/app" replace /> : <AuthPage />
}

function ProtectedAppRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <App /> : <Navigate to="/" replace />
}

function ProtectedSetupRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <SetupPage /> : <Navigate to="/" replace />
}

function ProtectedProfileRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <ProfilePage /> : <Navigate to="/" replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionGate><LandingRoute /></SessionGate>} />
        <Route path="/app" element={<SessionGate><ProtectedAppRoute /></SessionGate>} />
        <Route path="/setup" element={<SessionGate><ProtectedSetupRoute /></SessionGate>} />
        <Route path="/profile" element={<SessionGate><ProtectedProfileRoute /></SessionGate>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
