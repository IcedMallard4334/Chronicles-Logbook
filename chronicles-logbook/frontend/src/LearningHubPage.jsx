import { useNavigate } from "react-router-dom"
import LogoIcon from "./ChroniclesLogo"
import LearningChronicles from "./LearningChronicles"
import "./App.css"
import "./HelpPage.css"
import "./LearningChronicles.css"
import "./Motion.css"
import "./MobileLayout.css"

/** The full Learning Chronicles hub, at /learning — every guide, not just the Home preview. */
export default function LearningHubPage() {
  const navigate = useNavigate()

  return (
    <div className="app-shell">
      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-flow" aria-hidden="true"><svg viewBox="0 0 1400 70" preserveAspectRatio="none"><path d="M-100 55 C180 -20 330 100 600 35 S1000 0 1500 45" /><path d="M-100 15 C250 90 420 -25 740 40 S1100 80 1500 10" /><path d="M-100 60 C350 20 500 80 900 15 S1200 65 1500 35" /></svg></div>
          <div className="nav-pill-left">
            <button type="button" className="nav-item" onClick={() => navigate("/app")} aria-label="Back to workspace">
              <span aria-hidden="true">←</span>
              <span>Back</span>
            </button>
            <button type="button" className="nav-item" onClick={() => navigate("/app")}>
              <LogoIcon size={30} />
              <span className="brand-name">Chronicles</span>
            </button>
          </div>
        </nav>
      </header>

      <main className="app-main help-main">
        <div className="help-card view-transition">
          <div className="help-header">
            <h1>Learning Chronicles</h1>
            <p className="help-subtitle">
              Short guides and tutorials that explain what a digital logbook is, how Chronicles
              works, and how to use it to build a useful record over time.
            </p>
          </div>
          <LearningChronicles variant="all" />
        </div>
      </main>
    </div>
  )
}
