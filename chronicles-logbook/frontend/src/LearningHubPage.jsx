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
