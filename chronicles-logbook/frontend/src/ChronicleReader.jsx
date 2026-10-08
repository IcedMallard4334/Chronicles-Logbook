import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import LogoIcon from "./ChroniclesLogo"
import LearningIcon from "./LearningIcons"
import { CHRONICLES, getChronicle } from "./learningContent"
import Walkthrough from "./Walkthrough"
import "./App.css"
import "./HelpPage.css"
import "./ChronicleReader.css"
import "./Motion.css"
import "./MobileLayout.css"

/** One block of lesson content, in the small vocabulary learningContent.js uses. */
function LessonBlock({ block }) {
  if (block.type === "p") return <p>{block.text}</p>

  if (block.type === "walkthrough") return <Walkthrough id={block.id} />

  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    )
  }

  if (block.type === "ol") {
    return (
      <ol>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    )
  }

  if (block.type === "dl") {
    return (
      <dl className="help-glossary">
        {block.items.map((item) => (
          <div className="help-glossary-item" key={item.term}>
            <dt>
              {item.icon && <span className="help-glossary-icon"><LearningIcon name={item.icon} /></span>}
              {item.term}
            </dt>
            <dd>{item.detail}</dd>
          </div>
        ))}
      </dl>
    )
  }

  if (block.type === "flow") {
    return (
      <div className="chronicle-flow" role="list">
        {block.steps.map((step, index) => (
          <span key={step} role="listitem">
            <span className="chronicle-flow-step">{step}</span>
            {index < block.steps.length - 1 && <span className="chronicle-flow-arrow" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>
    )
  }

  if (block.type === "callout") {
    return <p className="chronicle-callout">{block.text}</p>
  }

  if (block.type === "example") {
    return (
      <div className="chronicle-example">
        {block.heading && <p className="chronicle-example-heading">{block.heading}</p>}
        <dl>
          {block.fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  return null
}

export default function ChronicleReader() {
  const navigate = useNavigate()
  const { chronicleId } = useParams()
  const chronicle = getChronicle(chronicleId)
  const [lessonIndex, setLessonIndex] = useState(0)

  // A fresh chronicle starts at its first lesson rather than wherever the
  // previous one was left.
  useEffect(() => {
    setLessonIndex(0)
  }, [chronicleId])

  if (!chronicle) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <nav className="nav-pill">
            <div className="nav-flow" aria-hidden="true"><svg viewBox="0 0 1400 70" preserveAspectRatio="none"><path d="M-100 55 C180 -20 330 100 600 35 S1000 0 1500 45" /><path d="M-100 15 C250 90 420 -25 740 40 S1100 80 1500 10" /><path d="M-100 60 C350 20 500 80 900 15 S1200 65 1500 35" /></svg></div>
            <div className="nav-pill-left">
              <button type="button" className="nav-item" onClick={() => navigate("/learning")}>
                <span aria-hidden="true">←</span>
                <span>Back</span>
              </button>
            </div>
          </nav>
        </header>
        <main className="app-main help-main">
          <div className="help-card">
            <div className="help-header">
              <h1>We couldn't find that guide</h1>
              <p className="help-subtitle">It may have been renamed or removed.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const lessons = chronicle.lessons
  const lesson = lessons[Math.min(lessonIndex, lessons.length - 1)]
  const isLast = lessonIndex >= lessons.length - 1
  const chronicleOrder = CHRONICLES.findIndex((item) => item.id === chronicle.id)
  const next = CHRONICLES[chronicleOrder + 1]

  return (
    <div className="app-shell">
      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-flow" aria-hidden="true"><svg viewBox="0 0 1400 70" preserveAspectRatio="none"><path d="M-100 55 C180 -20 330 100 600 35 S1000 0 1500 45" /><path d="M-100 15 C250 90 420 -25 740 40 S1100 80 1500 10" /><path d="M-100 60 C350 20 500 80 900 15 S1200 65 1500 35" /></svg></div>
          <div className="nav-pill-left">
            <button
              type="button"
              className="nav-item"
              onClick={() => navigate("/learning")}
              aria-label="Back to Learning Chronicles"
            >
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
        <div className="help-card view-transition chronicle-reader">
          <p className="help-article-eyebrow">Learning Chronicles</p>
          <div className="chronicle-reader-head">
            <span className="chronicle-reader-icon" aria-hidden="true">
              <LearningIcon name={chronicle.icon} />
            </span>
            <h1>{chronicle.title}</h1>
          </div>

          <p className="chronicle-progress" aria-live="polite">
            {lessons.length > 1
              ? `Lesson ${lessonIndex + 1} of ${lessons.length}`
              : "1 lesson"}
          </p>
          <div className="chronicle-progress-bar" aria-hidden="true">
            {lessons.map((item, index) => (
              <span key={item.title} className={index <= lessonIndex ? "is-done" : ""} />
            ))}
          </div>

          <article className="chronicle-lesson">
            <h2>{lesson.title}</h2>
            {lesson.blocks.map((block, index) => (
              <LessonBlock block={block} key={index} />
            ))}
          </article>

          <div className="chronicle-lesson-nav">
            <button
              type="button"
              className="btn-text"
              onClick={() => setLessonIndex((index) => Math.max(index - 1, 0))}
              disabled={lessonIndex === 0}
            >
              ← Previous
            </button>
            {isLast ? (
              <span className="chronicle-complete" role="status">You've completed this guide</span>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setLessonIndex((index) => index + 1)}>
                Next →
              </button>
            )}
          </div>

          {isLast && (
            <footer className="chronicle-reader-foot">
              {next ? (
                <button type="button" className="btn-secondary" onClick={() => navigate(`/learning/${next.id}`)}>
                  Next guide: {next.title} →
                </button>
              ) : <span />}
              <button type="button" className="btn-text" onClick={() => navigate("/learning")}>
                Back to Learning Chronicles
              </button>
            </footer>
          )}
        </div>
      </main>
    </div>
  )
}
