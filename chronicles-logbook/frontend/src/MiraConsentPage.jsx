import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchMiraConsent, saveMiraConsent } from './api'
import OnboardingLayout from './OnboardingLayout'
import { readPreference } from './preferences'
import './SetupPage.css'

// Consent is decided once per sign-in and rarely changes; caching it here
// means navigating away from /app and back doesn't re-show this gate's
// loading screen every time. A fresh fetch still runs in the background to
// pick up changes made on the Mira permissions page, it just doesn't block
// the view the user already had access to a moment ago.
let consentCache = null

export function MiraConsentGate({ children }) {
  const [state, setState] = useState(consentCache?.decided ? 'ready' : 'loading')
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    fetchMiraConsent().then(choice => {
      consentCache = choice
      if (!active) return
      if (!choice.decided) navigate('/mira-permissions', { replace: true })
      else setState('ready')
    }).catch(() => { if (active && !consentCache?.decided) setState('error') })
    return () => { active = false }
  }, [navigate])
  if (state === 'ready') return children
  return <OnboardingLayout><section className="setup-card view-transition"><div className="mira-gate-status" role="status">
    {state !== 'error' && <span className="mira-gate-spinner" aria-hidden="true" />}
    <p>{state === 'error' ? 'Could not load your Mira permissions.' : 'Dusting off your logbook…'}</p>
  </div>{state === 'error' && <button className="btn-secondary" onClick={() => window.location.reload()}>Try again</button>}</section></OnboardingLayout>
}

export default function MiraConsentPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function choose(accepted) {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await saveMiraConsent(accepted)
      consentCache = { decided: true, accepted }
      navigate(`/app?view=${readPreference('start-view', 'home')}`, { replace: true })
    } catch { setError('Your choice could not be saved. Please try again.'); setSaving(false) }
  }
  return <section className="setup-card view-transition" aria-labelledby="consent-title">
    <header className="setup-header"><p className="setup-eyebrow">STEP 3 OF 3 · YOUR CHOICE</p><h1 id="consent-title">Your work. Your permission.</h1><p>Choose how you use Mira before entering your workspace.</p></header>
    <section className="consent-summary" aria-label="Permission summary">
      <p><strong>Accept:</strong> Your Mira messages go to Google Gemini for AI replies and project proposals.</p>
      <p><strong>Decline:</strong> Keep using Chronicles with basic local Mira guidance. Nothing is sent to Gemini.</p>
      <p><strong>Your control:</strong> Mira cannot automatically read saved work or your calendar. Projects need your confirmation, and you can change your choice later.</p>
      <p className="consent-caution">Avoid sensitive information. Provider processing and retention depend on the service tier.</p>
    </section>
    <details className="consent-details">
    <summary>Read more about terms & data access</summary>
    <section className="setup-section"><h2>Mira usage terms & data access</h2><p>If you accept, messages you send to Mira—including any information you type or paste—are sent to Google Gemini to generate replies and project proposals.</p><p>Mira currently cannot automatically read your saved projects, entries, tasks, or Google Calendar. This choice does not grant that access. Any future expansion should request a new permission.</p></section>
    <section className="setup-section"><h2>You stay in control</h2><p>Review AI suggestions for accuracy. A proposed project is created only after you confirm it. Avoid sharing passwords, credentials, or information you are not permitted to share.</p><p>Chat history is held in this browser session and clears on refresh. That does not mean the AI provider deletes submitted messages. Provider processing is governed by its <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy policy</a>.</p><p>Google’s handling differs by service tier: unpaid API content may be used to improve its products and reviewed by people; paid API content is not used for that improvement, but may be logged for safety. Do not send sensitive or confidential information.</p></section>
    <section className="setup-section"><h2>If you decline</h2><p>Chronicles remains available. Mira offers basic local guidance only: no messages are sent to Gemini and no AI project proposals are generated.</p><p>You can change this choice through “Mira permissions” on the Mira page. Withdrawing permission stops future AI requests; it cannot recall messages already sent. We save your choice, its date, and the notice version to your account.</p></section>
    </details>
    {error && <p role="alert">{error}</p>}
    <footer className="setup-footer"><button className="btn-secondary" disabled={saving} onClick={() => choose(false)}>Decline · use limited Mira</button><button className="btn-primary" disabled={saving} onClick={() => choose(true)}>{saving ? 'Saving…' : 'Accept · enable Mira'}</button></footer>
    <p className="mira-footnote">Mira notice version 2026-09-14. <Link to="/setup">Back to preferences</Link></p>
  </section>
}
