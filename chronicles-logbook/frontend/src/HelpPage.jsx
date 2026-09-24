import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import LogoIcon from "./ChroniclesLogo"
import { HELP_SECTIONS } from "./helpContent"
import "./App.css"
import "./HelpPage.css"

function ArticleBlock({ block }) {
  if (block.type === "p") return <p>{block.text}</p>

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
            <dt>{item.term}</dt>
            <dd>{item.detail}</dd>
            {item.example && (
              <p className="help-glossary-example">
                <strong>Example: </strong>
                {item.example}
              </p>
            )}
          </div>
        ))}
      </dl>
    )
  }

  return null
}

function matchesQuery(article, query) {
  if (!query) return true
  const haystack = `${article.title} ${(article.keywords || []).join(" ")}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export default function HelpPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState("")

  // Flattened once for O(1) "find the active article" lookups — the nav
  // itself still renders HELP_SECTIONS grouped, this is just an index.
  const allArticles = useMemo(
    () =>
      HELP_SECTIONS.flatMap((section) =>
        section.articles.map((article) => ({ ...article, sectionTitle: section.title }))
      ),
    []
  )

  const defaultArticleId = allArticles[0]?.id
  const activeId = searchParams.get("topic") || defaultArticleId
  const activeArticle = allArticles.find((article) => article.id === activeId) || allArticles[0]

  const filteredSections = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return HELP_SECTIONS
    return HELP_SECTIONS
      .map((section) => ({
        ...section,
        articles: section.articles.filter((article) => matchesQuery(article, trimmed)),
      }))
      .filter((section) => section.articles.length > 0)
  }, [query])

  const selectArticle = (id) => {
    setSearchParams(id === defaultArticleId ? {} : { topic: id })
  }

  return (
    <div className="app-shell">
      <div className="app-bg-dynamic" aria-hidden="true">
        <div className="app-bg-sky" />
        <div className="app-bg-waves">
          <svg className="wave wave-back" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-mid" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,256L48,245.3C96,235,192,213,288,202.7C384,192,480,192,576,208C672,224,768,256,864,261.3C960,267,1056,245,1152,229.3C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="wave wave-front" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path d="M0,288L48,282.7C96,277,192,267,288,245.3C384,224,480,192,576,197.3C672,203,768,245,864,261.3C960,277,1056,267,1152,250.7C1248,235,1344,213,1392,202.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>
        <div className="app-bg-grid" />
      </div>

      <header className="topbar">
        <nav className="nav-pill">
          <div className="nav-pill-left">
            <button
              type="button"
              className="nav-item"
              onClick={() => navigate("/app")}
              aria-label="Back to workspace"
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
        <div className="help-card">
          <div className="help-header">
            <h1>Help &amp; documentation</h1>
            <p className="help-subtitle">
              Everything Chronicles can do, and when you'd reach for it. Search for a
              feature or a field type, or browse by topic on the left.
            </p>
            <div className="help-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help topics — try “computed field” or “sharing”"
                aria-label="Search help topics"
              />
            </div>
          </div>

          <div className="help-body">
            <nav className="help-nav" aria-label="Help topics">
              {filteredSections.length === 0 ? (
                <p className="help-no-results">No topics match &ldquo;{query}&rdquo;.</p>
              ) : (
                filteredSections.map((section) => (
                  <div className="help-nav-section" key={section.id}>
                    <h2>{section.title}</h2>
                    <ul>
                      {section.articles.map((article) => (
                        <li key={article.id}>
                          <button
                            type="button"
                            className={article.id === activeArticle?.id ? "is-active" : ""}
                            aria-current={article.id === activeArticle?.id ? "true" : undefined}
                            onClick={() => selectArticle(article.id)}
                          >
                            {article.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </nav>

            <article className="help-article" aria-live="polite">
              {activeArticle ? (
                <>
                  <p className="help-article-eyebrow">{activeArticle.sectionTitle}</p>
                  <h2>{activeArticle.title}</h2>
                  {activeArticle.blocks.map((block, index) => (
                    <ArticleBlock block={block} key={index} />
                  ))}
                </>
              ) : (
                <p>Select a topic on the left to get started.</p>
              )}
            </article>
          </div>
        </div>
      </main>
    </div>
  )
}
