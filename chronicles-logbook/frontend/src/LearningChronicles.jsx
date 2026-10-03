import { useNavigate } from "react-router-dom"
import LearningCardArt from "./LearningCardArt"
import { CHRONICLES, PLANNED_CHRONICLE_COUNT } from "./learningContent"
import "./LearningChronicles.css"

/**
 * The card grid for Learning Chronicles — the app's built-in learning
 * centre. Shared between the Home page (a trimmed preview) and the full hub
 * at /learning (everything), so the two never drift out of sync with each
 * other or with learningContent.js.
 */
export default function LearningChronicles({ variant = "home" }) {
  const navigate = useNavigate()
  const isHome = variant === "home"
  const visible = isHome ? CHRONICLES.slice(0, 4) : CHRONICLES
  const remaining = PLANNED_CHRONICLE_COUNT - CHRONICLES.length

  return (
    <section
      className={`learning-chronicles ${isHome ? "" : "is-all"}`}
      aria-labelledby={isHome ? "learning-chronicles-title" : undefined}
      aria-label={isHome ? undefined : "Learning Chronicles guides"}
    >
      {isHome && (
        <header className="learning-chronicles-head">
          <div>
            <span className="workspace-eyebrow">LEARNING CHRONICLES</span>
            <h2 id="learning-chronicles-title">Learn how to get the most out of your digital logbook</h2>
            <p>
              Short guides and tutorials that explain what a digital logbook is, how Chronicles
              works, and how to use it to build a useful record over time.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => navigate("/learning")}>
            Explore all Learning Chronicles →
          </button>
        </header>
      )}

      <ul className="learning-card-grid">
        {visible.map((chronicle) => (
          <li key={chronicle.id}>
            <button
              type="button"
              className="learning-card"
              onClick={() => navigate(`/learning/${chronicle.id}`)}
            >
              <span className="learning-card-art-wrap">
                <LearningCardArt scene={chronicle.art} wash={chronicle.wash} />
                {chronicle.meta?.duration && (
                  <span className="learning-card-duration">{chronicle.meta.duration}</span>
                )}
              </span>
              <span className="learning-card-body">
                <strong>{chronicle.title}</strong>
                <p>{chronicle.description}</p>
                {(chronicle.meta?.level || chronicle.meta?.tag) && (
                  <span className="learning-card-meta">
                    {chronicle.meta.level && <span>{chronicle.meta.level}</span>}
                    {chronicle.meta.tag && <span>{chronicle.meta.tag}</span>}
                  </span>
                )}
                <span className="learning-card-cta">Start learning →</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!isHome && remaining > 0 && (
        <p className="learning-more-note">
          {remaining} more {remaining === 1 ? "chronicle is" : "chronicles are"} on the way.
        </p>
      )}
    </section>
  )
}
