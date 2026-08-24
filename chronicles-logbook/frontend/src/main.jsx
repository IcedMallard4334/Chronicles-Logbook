import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthCallback from './AuthCallback.jsx'
import AuthPage from './AuthPage.jsx'
import ForgotPassword from './ForgotPassword.jsx'
import ProfilePage from './ProfilePage.jsx'
import ResetPassword from './ResetPassword.jsx'

export function LandingRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <Navigate to="/app" replace /> : <AuthPage mode="signin" />
}

export function ProtectedAppRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <App /> : <Navigate to="/" replace />
}

export function ProtectedProfileRoute() {
  const isSignedIn = Boolean(window.localStorage.getItem('chronicles_token'))
  return isSignedIn ? <ProfilePage /> : <Navigate to="/" replace />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/app" element={<ProtectedAppRoute />} />
        <Route path="/profile" element={<ProtectedProfileRoute />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
