import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import ChroniclesLogo from "./ChroniclesLogo"
import { StreakIcon } from "./Streaks"
import { getGoogleLoginUrl } from "./api"
import "./LandingPage.css"

/**
 * The page a visitor sees before signing in: what Chronicles is, what it does
 * and why it is worth a minute, laid out as one long scroll. Everything on it is
 * drawn in CSS (no images to download), so it stays fast.
 */

const FEATURES = [
  { icon: "fields", title: "A logbook in your shape", text: "Decide what an entry records: text, numbers, dates, tags, checklists, links between entries, even calculated figures. Every project keeps its own format." },
  { icon: "bolt", title: "Capture in seconds", text: "Open a project, type, press Enter. Anything predictable is filled in for you, and you can keep typing offline." },
  { icon: "chart", title: "Statistics that follow you", text: "Total, group and plot any field you invented. Time per project, entries per week, and the run of days you have kept up." },
  { icon: "grid", title: "A dashboard that is yours", text: "Drag and resize panels: your projects, boards, saved filters, statistics and the badges you have earned." },
  { icon: "history", title: "A record you can trust", text: "Every correction keeps what it replaced. See what an entry said on any date, and put it back the way it was." },
  { icon: "cloud", title: "Offline, and always yours", text: "Capture without a connection and sync later. Export everything in a form you can read without us, and bring it back whenever." },
]

const SHOWCASE = [
  {
    id: "shape",
    eyebrow: "Make it fit",
    title: "Your fields. Your format. Your way.",
    text: "A uni module, a build log and a gym diary should not share a form. Add, rename or drop a field at any time and your older entries come along, with every earlier version still readable.",
    points: ["Text, number, date, dropdown, tags, checklist, links", "Calculated fields like hours × rate", "Change the format without losing a thing"],
  },
  {
    id: "plan",
    eyebrow: "Know what is next",
    title: "From “still to do” to done, on a board.",
    text: "Entries record what you did. Tasks and due dates hold what you still need to. See it all on Today, Outstanding, the calendar, or a board grouped by whatever status suits you.",
    points: ["Statuses you name yourself", "Due dates and times with gentle reminders", "A calendar that sits beside Google Calendar"],
  },
  {
    id: "automate",
    eyebrow: "Let it do the routine",
    title: "Automations that follow the way you work.",
    text: "When something is done, add the follow-up task. When a bug is logged, tag it and put it on the board. When a habit comes round, make it repeat. Start from an idea, adjust it, forget about it.",
    points: ["Waits for a new entry or a status", "Adds tasks, moves statuses, repeats entries", "Never touches what you already wrote"],
  },
  {
    id: "mira",
    eyebrow: "Meet Mira",
    title: "An assistant that does the clicking for you.",
    text: "Ask in plain words and Mira sets up the project, adds the tasks, schedules the activity or puts a panel on your dashboard. She shows you what she will do first, and nothing happens until you say yes.",
    points: ["Dictate instead of type", "Reads only what you allow", "Deletions always ask first"],
  },
]

const USE_CASES = [
  {
    id: "student",
    label: "Students",
    title: "A study log that shows where the term went.",
    text: "One project per module. Log lectures, labs and reading with the hours you spent, tick off assignments, and watch your weekly rhythm build up before exams.",
    fields: ["Module", "Hours", "Topic", "Confidence", "Revision tags"],
  },
  {
    id: "builder",
    label: "Developers",
    title: "A build journal for every project.",
    text: "Record what shipped, what broke and what you learned. Track time against each project, turn bugs into tasks, and keep a history of every decision.",
    fields: ["Feature", "Hours", "Kind", "Linked entry", "Notes"],
  },
  {
    id: "researcher",
    label: "Researchers",
    title: "A lab notebook that keeps its own history.",
    text: "Capture experiments as they happen, link a result back to the method that produced it, and show exactly what a note said last month.",
    fields: ["Experiment", "Result", "Method link", "Date", "Checklist"],
  },
]

const STEPS = [
  { title: "Create a project", text: "Name it and choose the fields an entry should carry. Start from a template or from scratch." },
  { title: "Log as you go", text: "Add entries in seconds, with time spent and anything else you decided to track." },
  { title: "Look back, and ahead", text: "Browse the timeline, read the statistics, plan what is next, and let Mira handle the routine." },
]

const FAQ = [
  { q: "Is Chronicles free?", a: "Yes. Sign in with your Google account and you can create projects, log entries and use every feature." },
  { q: "Does it work without internet?", a: "Entries are captured offline on whatever device you have and sync as soon as you are connected again. Anything that needs attention is flagged so nothing is lost silently." },
  { q: "Can I get my data out?", a: "Always. Export everything in a plain, readable format and import it back whenever you like. The record belongs to you." },
  { q: "What does Mira see?", a: "Only what you allow, and only names and short titles, never whole entries. She proposes changes and waits for your approval, and anything that deletes always asks first." },
  { q: "What if I change my mind about a field?", a: "Rename it, add one, or drop one. Existing entries are carried across, and an earlier version of any entry can be read or restored." },
]

function Icon({ name }) {
  const paths = {
    fields: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="11" width="11" height="5" rx="1.5" /><rect x="3" y="18" width="7" height="3" rx="1" /></>,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
    chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 4 3 9 8 9" /><path d="M12 7v5l3 2" /></>,
    cloud: <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z" />,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}

/** The app, drawn in CSS: enough to see what Chronicles looks like without a screenshot to download. */
function HeroMock() {
  return (
    <div className="lp-mock" aria-hidden="true">
      <div className="lp-mock-bar"><i /><i /><i /><span>Chronicles</span></div>
      <div className="lp-mock-body">
        <aside>
          <b>Projects</b>
          <p className="is-on">Operating Systems</p>
          <p>Capstone build</p>
          <p>Gym diary</p>
        </aside>
        <div className="lp-mock-main">
          <div className="lp-mock-stats">
            <div><strong>42h</strong><span>Hours logged</span></div>
            <div><strong>128</strong><span>Entries</span></div>
            <div><strong>9</strong><span>Open tasks</span></div>
          </div>
          <div className="lp-mock-chart">
            {[38, 62, 45, 80, 55, 92, 70].map((height, index) => <i key={index} style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }} />)}
          </div>
          <div className="lp-mock-rows">
            <p><em>Lab 4: scheduling</em><span className="is-done">Done</span></p>
            <p><em>Read chapter 7</em><span>To do</span></p>
          </div>
        </div>
      </div>
      <div className="lp-mock-badge"><StreakIcon kind="login" size={15} /> 12-day streak</div>
      <div className="lp-mock-mira"><b>Mira</b> I added 3 tasks to “Capstone build”.</div>
    </div>
  )
}

function ShowcaseArt({ id }) {
  if (id === "shape") {
    return (
      <div className="lp-art lp-art-fields" aria-hidden="true">
        {[["Module", "Text"], ["Hours", "Number"], ["Topic", "Tags"], ["Confidence", "Dropdown"], ["Revise", "Checklist"], ["Cost", "Hours × 120"]].map(([name, type]) => (
          <p key={name}><strong>{name}</strong><span>{type}</span></p>
        ))}
      </div>
    )
  }
  if (id === "plan") {
    return (
      <div className="lp-art lp-art-board" aria-hidden="true">
        {[["Still to do", ["Draft report", "Book lab slot"]], ["In progress", ["Parser"]], ["Done", ["Lab 4", "Notes"]]].map(([name, cards]) => (
          <div key={name}><b>{name}</b>{cards.map((card) => <p key={card}>{card}</p>)}</div>
        ))}
      </div>
    )
  }
  if (id === "automate") {
    return (
      <div className="lp-art lp-art-flow" aria-hidden="true">
        <p><span>When</span> an entry moves to <strong>Done</strong></p>
        <i />
        <p><span>Then</span> add the task <strong>“Write up: Lab 4”</strong></p>
        <i />
        <p><span>And</span> repeat it <strong>every week</strong></p>
      </div>
    )
  }
  return (
    <div className="lp-art lp-art-chat" aria-hidden="true">
      <p className="is-you">Set up a project for my capstone with three tasks.</p>
      <p className="is-mira"><b>Mira would like to do 4 things</b><span>Create project “Capstone”</span><span>Add 3 tasks</span><em>Do all 4</em></p>
    </div>
  )
}

function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const items = root.querySelectorAll("[data-reveal]")
    if (typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.classList.add("is-visible"))
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible")
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])
  return ref
}

export default function LandingPage() {
  const [useCase, setUseCase] = useState(USE_CASES[0].id)
  const active = USE_CASES.find((item) => item.id === useCase)
  const pageRef = useReveal()
  const start = getGoogleLoginUrl()

  return (
    <div className="lp" ref={pageRef}>
      <header className="lp-nav">
        <Link className="lp-brand" to="/" aria-label="Chronicles home">
          <ChroniclesLogo size={34} />
          <span>Chronicles</span>
        </Link>
        <nav aria-label="Sections" className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#mira">Mira</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-actions">
          <Link className="lp-link" to="/signin">Sign in</Link>
          <a className="lp-button" href={start}>Get started</a>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">The digital logbook</p>
            <h1 id="lp-title">Keep a record of everything you work on. <em>Shaped your way.</em></h1>
            <p className="lp-lead">
              Chronicles is a logbook you design yourself: capture what you did in seconds, plan what is next,
              and watch your work add up to a story you can search, chart and trust.
            </p>
            <div className="lp-cta">
              <a className="lp-button lp-button-large" href={start}>Start your logbook, free</a>
              <a className="lp-ghost" href="#features">See what it does</a>
            </div>
            <p className="lp-note">Sign in with Google · Works offline · Export anytime</p>
          </div>
          <HeroMock />
        </section>

        <section className="lp-strip" aria-label="Why people keep a logbook">
          <p><strong>Every correction kept</strong><span>Nothing you write is ever overwritten</span></p>
          <p><strong>Offline first</strong><span>Capture anywhere, sync when you can</span></p>
          <p><strong>Your data, your way</strong><span>Export it, read it, bring it back</span></p>
          <p><strong>Built for habits</strong><span>Streaks and badges to keep you going</span></p>
        </section>

        <section className="lp-section" id="features" aria-labelledby="lp-features-title">
          <div className="lp-heading" data-reveal>
            <p className="lp-eyebrow">Everything in one place</p>
            <h2 id="lp-features-title">A logbook that does more than hold notes.</h2>
            <p>From the first entry to a year of history, Chronicles stays quick and keeps everything you recorded.</p>
          </div>
          <ul className="lp-features">
            {FEATURES.map((feature, index) => (
              <li key={feature.title} data-reveal style={{ transitionDelay: `${(index % 3) * 70}ms` }}>
                <span className="lp-feature-icon"><Icon name={feature.icon} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {SHOWCASE.map((item, index) => (
          <section className={`lp-show${index % 2 ? " is-flipped" : ""}`} id={item.id === "mira" ? "mira" : undefined} key={item.id} aria-labelledby={`lp-${item.id}`}>
            <div className="lp-show-copy" data-reveal>
              <p className="lp-eyebrow">{item.eyebrow}</p>
              <h2 id={`lp-${item.id}`}>{item.title}</h2>
              <p>{item.text}</p>
              <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
            </div>
            <div className="lp-show-art" data-reveal>
              <ShowcaseArt id={item.id} />
            </div>
          </section>
        ))}

        <section className="lp-section lp-how" id="how" aria-labelledby="lp-how-title">
          <div className="lp-heading" data-reveal>
            <p className="lp-eyebrow">How it works</p>
            <h2 id="lp-how-title">Up and running in three steps.</h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} data-reveal style={{ transitionDelay: `${index * 90}ms` }}>
                <span aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-cases" aria-labelledby="lp-cases-title">
          <div className="lp-heading" data-reveal>
            <p className="lp-eyebrow">Made for the way you work</p>
            <h2 id="lp-cases-title">One logbook, as many formats as you need.</h2>
          </div>
          <div className="lp-tabs" role="group" aria-label="Who it is for" data-reveal>
            {USE_CASES.map((item) => (
              <button key={item.id} type="button" className={item.id === useCase ? "is-selected" : ""} aria-pressed={item.id === useCase} onClick={() => setUseCase(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="lp-case" data-reveal>
            <div>
              <h3>{active.title}</h3>
              <p>{active.text}</p>
            </div>
            <ul aria-label="Example fields">
              {active.fields.map((field) => <li key={field}>{field}</li>)}
            </ul>
          </div>
        </section>

        <section className="lp-motivate" aria-labelledby="lp-motivate-title">
          <div data-reveal>
            <p className="lp-eyebrow">Keep the habit</p>
            <h2 id="lp-motivate-title">Streaks, badges and a little confetti.</h2>
            <p>Show up and save something each day to grow your streaks. Earn badges for first projects, long hours and steady weeks, and see them all on your profile.</p>
          </div>
          <ul className="lp-badges" aria-hidden="true" data-reveal>
            {["First Chapter", "Century Clock", "Creature of Habit", "Autopilot", "Time Traveller"].map((name, index) => (
              <li key={name} className={`tier-${index % 4}`}><span>{name}</span></li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq-title">
          <div className="lp-heading" data-reveal>
            <p className="lp-eyebrow">Good to know</p>
            <h2 id="lp-faq-title">Questions, answered.</h2>
          </div>
          <div className="lp-faq-list" data-reveal>
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-final" aria-labelledby="lp-final-title">
          <h2 id="lp-final-title">Your next entry is a minute away.</h2>
          <p>Create a project, choose your fields and log the first thing you did today.</p>
          <div className="lp-cta">
            <a className="lp-button lp-button-large" href={start}>Start your logbook, free</a>
            <Link className="lp-ghost" to="/signin">I already have an account</Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <Link className="lp-brand" to="/" aria-label="Chronicles home">
          <ChroniclesLogo size={28} />
          <span>Chronicles</span>
        </Link>
        <p>A digital logbook for the work you do. Built for COMS3011A at the University of the Witwatersrand.</p>
        <nav aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <Link to="/signin">Sign in</Link>
        </nav>
      </footer>
    </div>
  )
}
