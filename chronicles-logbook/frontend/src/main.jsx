import { Suspense, StrictMode, lazy, useEffect, useState } from 'react'
import { fetchCurrentUser, refreshSession } from './api'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import './index.css'
import AuthPage from './AuthPage.jsx'
import { ViewLoader } from './ViewTransition.jsx'
import { applyPreferences, readPreference } from './preferences'
import './ProfessionalDensity.css'
import './WorkspacePolish.css'

// AuthPage stays a static import: it's the first thing an unauthenticated
// visitor sees, and the only route most of them ever load. Everything below
// is behind a route only a signed-in visit (or an OAuth round trip) reaches,
// so it costs nothing until then — a Lighthouse pass against the live site
// found the whole app (App.jsx, recharts, the calendar, the AI assistant —
// one 737KB chunk) was being downloaded and parsed before the sign-in page
// could even paint, which was the dominant cause of an 8s+ LCP there.
const App = lazy(() => import('./App.jsx'))
const AuthCallback = lazy(() => import('./AuthCallback.jsx'))
const ProfilePage = lazy(() => import('./ProfilePage.jsx'))
const SetupPage = lazy(() => import('./SetupPage.jsx'))
const OnboardingLayout = lazy(() => import('./OnboardingLayout.jsx'))
const MiraConsentPage = lazy(() => import('./MiraConsentPage.jsx'))
const MiraConsentGate = lazy(() =>
  import('./MiraConsentPage.jsx').then((module) => ({ default: module.MiraConsentGate }))
)

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
  return children || <Outlet />
}

function LandingRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <Navigate to="/app" replace /> : <AuthPage />
}

function ProtectedAppRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <MiraConsentGate><App /></MiraConsentGate> : <Navigate to="/" replace />
}

function ProtectedSetupRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <OnboardingLayout /> : <Navigate to="/" replace />
}

function ProtectedProfileRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <ProfilePage /> : <Navigate to="/" replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<ViewLoader label="Loading…" delay={0} />}>
        <Routes>
          <Route element={<SessionGate />}>
            <Route path="/" element={<LandingRoute />} />
            <Route path="/app" element={<ProtectedAppRoute />} />
            <Route element={<ProtectedSetupRoute />}>
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/mira-permissions" element={<MiraConsentPage />} />
            </Route>
            <Route path="/profile" element={<ProtectedProfileRoute />} />
          </Route>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
