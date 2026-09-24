import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ACCENTS, applyPreferences, readPreference, savePreferences } from "./preferences"
import "./SetupPage.css"

export default function SetupPage() {
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState(() => ({
    theme: readPreference("theme", "dark"),
    accent: readPreference("accent", "chronicles"),
    density: readPreference("density", "comfortable"),
    startView: readPreference("start-view", "home"),
  }))

  const choose = (key, value) => setPreferences(current => ({ ...current, [key]: value }))

  useEffect(() => {
    applyPreferences(preferences)
  }, [preferences])
  const finish = () => {
    savePreferences(preferences)
    navigate('/mira-permissions', { replace: true })
  }

  return (
      <section className="setup-card view-transition" aria-labelledby="setup-title">
        <header className="setup-header">
          <div><p className="setup-eyebrow">WELCOME TO CHRONICLES</p><h1 id="setup-title">Make it yours</h1><p>Choose a calm starting point. You can change every option later from your profile.</p></div>
        </header>

        <section className="setup-section" aria-labelledby="theme-title">
          <div><h2 id="theme-title">Appearance</h2><p>Choose the brightness that feels easiest to work in.</p></div>
          <div className="setup-choice-grid two-up" role="radiogroup" aria-label="Theme">
            {[['dark', 'Dark', 'Focused, low-glare workspace'], ['light', 'Light', 'Clean, bright workspace'], ['system', 'System', 'Match your device']].map(([id, name, description]) => <button key={id} type="button" role="radio" aria-checked={preferences.theme === id} className={`setup-choice theme-${id} ${preferences.theme === id ? 'is-selected' : ''}`} onClick={() => choose('theme', id)}><strong>{name}</strong><span>{description}</span></button>)}
          </div>
        </section>

        <section className="setup-section" aria-labelledby="accent-title">
          <div><h2 id="accent-title">Accent colour</h2><p>This colours controls, focus states, and useful highlights across the app.</p></div>
          <div className="setup-choice-grid accent-grid" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map(accent => <button key={accent.id} type="button" role="radio" aria-checked={preferences.accent === accent.id} className={`setup-choice accent-choice accent-${accent.id} ${preferences.accent === accent.id ? 'is-selected' : ''}`} onClick={() => choose('accent', accent.id)}><i aria-hidden="true" /><strong>{accent.name}{accent.recommended && <em>Recommended</em>}</strong><span>{accent.description}</span></button>)}
          </div>
        </section>

        <section className="setup-section setup-options" aria-labelledby="workspace-title">
          <div><h2 id="workspace-title">Workspace preferences</h2><p>Small choices that shape your daily view.</p></div>
          <label><span>Information density</span><select value={preferences.density} onChange={event => choose('density', event.target.value)}><option value="comfortable">Comfortable — more breathing room</option><option value="compact">Compact — fit more on screen</option></select></label>
          <label><span>Open Chronicles to</span><select value={preferences.startView} onChange={event => choose('startView', event.target.value)}><option value="home">Home workspace</option><option value="today">Today</option><option value="calendar">Calendar</option></select></label>
        </section>

        <footer className="setup-footer"><button type="button" className="btn-secondary" onClick={() => navigate('/mira-permissions')}>Skip for now</button><button type="button" className="btn-primary" onClick={finish}>Save and continue →</button></footer>
      </section>
  )
}
