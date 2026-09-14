import { useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AuthIntro } from './AuthPage'
import './SetupPage.css'

export default function OnboardingLayout({ children }) {
  const { pathname } = useLocation()
  const panel = useRef(null)
  useLayoutEffect(() => {
    // Each step starts at its heading, even if preferences were scrolled down.
    if (panel.current) panel.current.scrollTop = 0
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])
  return <main className="auth-shell setup-shell"><AuthIntro /><section ref={panel} className="auth-panel setup-panel">{children || <Outlet />}</section></main>
}
