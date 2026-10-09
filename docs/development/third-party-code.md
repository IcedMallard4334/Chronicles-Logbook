# Third-Party Code

Every third-party package Chronicles depends on, what it is used for, and why it
was chosen over the alternatives. Nothing here is vendored — all of it is
installed from PyPI or npm at the pinned versions in `requirements.txt`,
`requirements-dev.txt` and `package.json`.

## Backend runtime

| Package | Used for | Why this one |
|---|---|---|
| `fastapi` | The HTTP API itself — routing, request validation, dependency injection, generated OpenAPI docs | Validation is declared once as Pydantic models and reused for parsing, error responses and documentation, so the API cannot drift from its own docs. The brief requires a hand-written API; FastAPI provides the framework, every endpoint is ours |
| `uvicorn[standard]` | ASGI server that runs the app in development and on Azure | The reference ASGI server for FastAPI; `[standard]` adds the C-accelerated HTTP parser and websocket support |
| `sqlalchemy` (2.0, async) | ORM and query builder | Lets the same models back both PostgreSQL in production and SQLite in tests. The 2.0 typed `Mapped[...]` style gives the models real type annotations |
| `asyncpg` | PostgreSQL driver | The fastest async Postgres driver for Python, and the one SQLAlchemy's async engine is best tested against |
| `aiosqlite` (dev) | SQLite driver for the test suite | Lets tests run against a throwaway file database with no PostgreSQL server, so CI needs no database service |
| `pydantic` | Request/response schemas and validation | Already FastAPI's validation layer; used directly for the entry-schema rules |
| `python-dotenv` | Loads `.env` in local development | Keeps secrets out of the repository and matches how Azure injects configuration as environment variables |
| `greenlet` | Required by SQLAlchemy to bridge its sync internals into async code | Not used directly; pinned because SQLAlchemy's async support silently breaks on a mismatched version |
| `PyJWT` | Signs and verifies the session access tokens | The brief forbids writing our own authentication. PyJWT is a focused, audited implementation of a standard, rather than a bespoke token format |
| `Authlib` | Google OAuth 2.0 client flow | Handles the authorisation-code exchange and state validation for us, which is exactly the part of OAuth that is dangerous to hand-roll |
| `itsdangerous` | Signs the session cookie used during the OAuth round trip | Required by Starlette's `SessionMiddleware` |
| `httpx` | Outbound HTTP, and the ASGI test client | One library covers both calling Google's APIs and driving the app in tests without a live server |
| `google-api-python-client`, `google-auth-httplib2`, `google-auth-oauthlib` | Google Calendar integration — reading the signed-in user's events | Google's own client libraries; they handle token refresh, which is the fiddly part of a long-lived calendar connection |
| `google-genai` | The Mira assistant's calls to Gemini | Google's official SDK for the Gemini API |
| `resend` | Transactional email | A small, modern API client; avoids running our own SMTP |

## Backend development and test

| Package | Used for |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` | Runs the async tests; configured in `asyncio_mode = auto` so tests need no decorator |
| `pytest-cov` | Coverage measurement, reported into CI and the README badges |
| `ruff` | Linting. Chosen over flake8 + isort + friends because it replaces all of them in one fast tool |

## Frontend runtime

| Package | Used for | Why this one |
|---|---|---|
| `react`, `react-dom` | The UI | The stack the team already knew; the component model suits a UI whose shape is driven by user-defined schemas |
| `react-router-dom` | Client-side routing between the workspace, profile and auth callback | The standard router for React; needed for the OAuth callback route to be a real URL |
| `recharts` | Statistics charts, including the per-field timelines | Composable React components rather than an imperative chart API, so charts are built from the same data the rest of the UI already holds |
| `serve` | Serves the built `dist/` folder on Azure (`npm start`) | The frontend is a static bundle after `vite build`; `serve` is the smallest thing that hosts it with SPA fallback |

## Frontend development and test

| Package | Used for |
|---|---|
| `vite`, `@vitejs/plugin-react` | Dev server and production bundler |
| `vitest`, `@vitest/coverage-v8` | Test runner and coverage, sharing Vite's transform pipeline so tests and the app resolve modules identically |
| `@testing-library/react`, `@testing-library/jest-dom` | Component tests written against what a user sees rather than component internals |
| `jsdom` | DOM implementation the component tests run in |
| `oxlint` | Linting. Much faster than ESLint on this codebase and needs no configuration |
| `@types/react`, `@types/react-dom` | Type definitions used by editor tooling |

## Declared but not used

These are left over from an earlier iteration, when a small Express service was
considered before the backend settled on FastAPI. Nothing in `src/` imports
them and no npm script invokes them:

`cors`, `dotenv`, `express`, `supertest`, `concurrently`, `nodemon`

They are recorded here rather than quietly left in place. Removing them is a
tidy-up rather than something to do immediately before a submission, because it
means regenerating `package-lock.json`, which CI installs from with `npm ci`.

**`better-sqlite3` was removed on 2026-10-07.** It was the one with a real cost: a
native module compiled during install, which broke `npm ci` on machines without
build tools and itself needed Node 22. The frontend now declares `engines: node >=20`
(Vite 8 and Vitest 4 need it) so an older runtime fails with a clear message instead
of a cryptic one. See PL-17 in [Decisions](../decisions/platform-and-delivery.md).

## Documentation and tooling

| Package or tool | Used for | Why this one |
|---|---|---|
| `mkdocs-material` | Builds this documentation site | The brief suggests a pre-established Markdown docs tool on static hosting. Material adds search, navigation and Mermaid diagrams with no code to write. |
| `pymdown-extensions` | Markdown extras the site uses | Admonitions, tabs and tables of contents the pages rely on. |
| `mermaid` (from a CDN) | The diagrams on the architecture pages | Diagrams stay as text in the repository and are rendered in the browser. |
| `axe-core` (not a dependency) | The accessibility audit of the signed-in app | Run by hand against the running app from a temporary folder, because Lighthouse cannot sign in. It is deliberately **not** in `package.json`, since it is not part of any build or test; adding it to CI is a possible next step ([N-07](../decisions/not-tested.md#n-07)). |
| Lighthouse | Performance, accessibility and SEO of the public landing page | Google's own auditing tool; see [API Performance](../testing/api-performance.md). |

## Vendored or copied code

None. Chronicles contains no copied third-party source files. Everything above
is installed from its package registry at the pinned version, so licences and
updates stay with the upstream project.
