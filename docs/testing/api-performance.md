# API Performance, Load & Robustness

Covers **US-3.15** (API robustness), **US-3.16** (latency & hosting), **US-3.17** (perceived performance & Lighthouse) and **US-3.18** (load & stress testing).

## Frontend performance: Google Lighthouse (US-3.17)

**Tool:** [Google Lighthouse](https://developer.chrome.com/docs/lighthouse) — Google's own auditing tool for page performance, accessibility, best practices and SEO, run either from Chrome DevTools or via the hosted [PageSpeed Insights](https://pagespeed.web.dev/) report, which runs the same Lighthouse engine against a live URL without needing a local Chrome install. We used PageSpeed Insights against the deployed site so results are reproducible by anyone with the URL, including a grader.

**Target:** `https://chronicles-drivenbydesign-app-hfeehwdce7dfd9fr.uaenorth-01.azurewebsites.net/` (the deployed landing page — the only page an unauthenticated crawl, like a grader's first look, can reach).

| Metric | 25 Sep 2026 (mobile, before) | 28 Sep 2026 (after) |
|---|---|---|
| Performance | 69 | **95** |
| Accessibility | 95 | **100** |
| Best Practices | 96 | **100** |
| SEO | 82 | **100** |

The first run found three concrete, fixable problems, all addressed the same week:

1. **Speed Index (the worst single metric, 8.3s on mobile).** The landing page's decorative background animations (glowing blobs, floating lines) looped forever, so the page never reached a visually "settled" frame within Lighthouse's trace window — every frame kept differing from the last, which the Speed Index calculation reads as the page still loading. Fixed by capping those animations to a few cycles (`animation-iteration-count`) instead of `infinite`; a real visitor never notices the difference, since nobody is still watching the background 15 seconds after the page loads.
2. **SEO errors (18 errors on `robots.txt`).** No `robots.txt` file existed, so the single-page app's catch-all client-side routing served `index.html` at that URL instead, which Google's crawler tried and failed to parse as a robots file. Fixed by adding a real `public/robots.txt`. Also added a missing `<meta name="description">`.
3. **Accessibility (one automated flag, several more found by manual code review).** A low-contrast label (light lavender text on a near-white panel), a lost-focus bug in the command palette after closing it, a screen-reader-invisible "calculated value" badge, missing `aria-checked` on checklist toggles, two unlabelled form inputs, and two heading-level skips (`h2` → `h4`). All fixed — see [Accessibility (US-3.19)](../methodology/user-feedback-sprint-3.md#accessibility-us-319) for the full list. Accessibility scored 95 automated, but a11y checkers only catch a fraction of real issues — the manual pass is what actually got it to 100.

Also fixed as part of the same pass: render-blocking font loading (moved to non-blocking `<link>`), a year-long `Cache-Control` on hashed build assets (`serve.json`), and a non-composited CSS animation (an animated `background-position` on the skeleton loader, replaced with a `transform`-based sheen that runs on the compositor thread instead of repainting every frame).

**Skeleton loading (perceived performance).** Every page that fetches data shows either a skeleton placeholder or an explicit loading state (a flowing-lines loader with a label, e.g. "Opening your logbook…") instead of a blank page — see `ViewLoader` / `SkeletonRows` in `chronicles-logbook/frontend/src/ViewTransition.jsx`. Content also fades/slides in once a fetch completes rather than popping in, applied consistently across the workspace, Profile, Help and onboarding pages.

**What's left.** Mobile Performance (95) is measured under Lighthouse's Slow-4G, low-end-CPU throttling profile — deliberately harsh. Getting materially higher would mean splitting the authenticated app's JS bundle further (it currently ships as one ~550 KB chunk, lazy-loaded only after sign-in) or server-rendering the landing page; both are larger architectural changes than this sprint's polish pass, and are recorded here rather than attempted blind.

## How we tested

All tests use `chronicles-logbook/scripts/load_test.py` (endpoint list in `load_test_endpoints.json`). It calls the **deployed API directly over HTTP** — never through the UI — and writes every run to `docs/evidence/` as a summary (`.md`) plus raw per-request data (`.csv`).

| | |
|---|---|
| **Target** | `https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net` (Azure App Service, UAE North) |
| **Client** | Home connection in Johannesburg, South Africa |
| **Runs** | Run 1: 27 Sep 2026, 05:34–05:36. Run 2: 27 Sep 2026, 07:35–07:37. Both against the same deployed code. |
| **Routes covered** | 11 read routes (projects, entries, tasks, search, saved filters, statistics, calendar, auth) and 6 write routes |
| **Deliberately excluded** | `/ai/chat` (paid per call), `/calendar/google/*` (calls Google), `/export` and `/import` (bulk operations), all `DELETE` routes |

Three modes:

- **Latency**: 20 sequential requests per route, no concurrency. Measures what a single user experiences.
- **Load**: 1,000 requests, 50 in flight at once, randomly spread across the read routes.
- **Robustness**: sends malformed bodies (no body, invalid JSON, wrong top-level type, missing fields, unknown fields) to every write route. From run 2 it also breaks one real field at a time in an otherwise valid body: a 100,000-character value, the wrong type, a negative number. Afterwards it checks the API is still healthy.

> **Both runs measure the same code.** The throughput fixes described under Finding 1 were not yet deployed at run 2 (the live `/openapi.json` did not yet list the Sprint 3 routes). Run 2 is therefore a **repeat baseline**, and the difference between the two runs shows how much results vary from one run to the next.

## Results

### Latency (single user): meets the target in both runs

| Metric | Run 1 | Run 2 | Target |
|---|---|---|---|
| Median across all routes | **143 ms** | **160 ms** | ~200 ms |
| Requests over 500 ms | **0 / 200** | **0 / 220** | none |
| Slowest route (p95) | `GET /statistics`, 260 ms | `GET /projects/{id}/tasks`, 347 ms | < 500 ms |
| `GET /health` median (no database work) | 124 ms | 130 ms | — |
| First request on a new connection | 761 ms | 657 ms | — |

`/health` does no database work, yet takes ~125–130 ms on its own. So most of each response time is the **network round-trip from Johannesburg to UAE North**, not server processing. The first request on a new connection takes 650–950 ms: the one-off cost of setting up HTTPS over that distance. Browsers reuse the connection, so a user pays it once per session, not on every click.

Evidence: `docs/evidence/latency-20260927-053410.md`, `docs/evidence/latency-20260927-073522.md`

### Load (50 concurrent requests): stays up, but slow

| Metric | Run 1 | Run 2 |
|---|---|---|
| Requests | 1,000 | 1,000 |
| Server errors / timeouts | **0 (0.00%)** | **1 (0.10%)**, a `500` on `GET /saved-filters` |
| API healthy after the burst | Yes | Yes |
| Throughput | **21.3 requests/second** | **14.2 requests/second** |
| Median response per route | 1.7–2.3 s | 2.3–3.1 s |
| p95 per route | 5.2–8.0 s | 5.2–19.1 s |
| Worst single response | 15.3 s | 21.3 s |

The API stayed up and recovered in both runs, and 999 of 1,000 requests succeeded even in the worse run. But under 50 concurrent requests, responses are 15–20x slower than for a single user, and the capacity itself varied by a third between two runs of identical code.

In run 2 the p95 splits into two groups: about 5–6 s for some routes and 18–19 s for others. And every route, including `/health`, has a worst case near 20 s. That pattern points to requests waiting on something shared, not to one slow route. See Finding 1.

Evidence: `docs/evidence/load-20260927-053540.md`, `docs/evidence/load-20260927-073727.md`

### Robustness (malformed input): no crashes

| Metric | Run 1 | Run 2 |
|---|---|---|
| Malformed requests sent | 162 | 297 (adds field-level checks) |
| Answered with 5xx / timed out | **0** | **0** |
| Invalid field values accepted | not tested | **6**, see Finding 5 |
| API healthy afterwards | Yes | Yes |
| Status returned for rejected input | `422` | `422` |

Every write route rejected every structurally malformed body. There were two kinds of exception:

- **Oversized descriptions were accepted** (6 requests). `POST /projects/{id}/tasks` and `PUT /projects/{id}` both saved a 100,000-character `description`. This is Finding 5.
- **Bodies with only unknown fields were accepted as no-ops** (15 requests). `PUT /projects/{project_id}` returned `200` for bodies such as `{}` or `{"title": 12345}`: all of `ProjectUpdate`'s fields are optional and unknown ones are ignored, so nothing changed. This is Finding 4.

Evidence: `docs/evidence/robustness-20260927-053447.md`, `docs/evidence/robustness-20260927-073611.md`

## Findings and what we're doing about them

### 1. Throughput bottleneck under concurrent load (US-3.18)

**Finding.** At 50 concurrent requests the API handles only 14–21 requests/second, and p95 latency reaches 5–19 s. `/health` slows down too (p95 4.5 s in run 1, 6.8 s in run 2), and it never touches the database. So requests are **queuing before they reach the route handlers**: the limit is how many requests the server can work on at once, not one slow query.

**Causes found in the code:**

1. **One worker process.** `backend/startup.txt` ran `uvicorn main:app` with no `--workers`, so a single Python process served every request.
2. **Default connection pool.** `create_async_engine` used SQLAlchemy's defaults: 5 pooled connections plus 10 "overflow" ones. Under 50 concurrent requests, the rest queue for a connection. Overflow connections are also closed as soon as they're returned, so sustained load keeps opening new TLS connections to Azure Postgres. This fits run 2's ~20 s worst cases on every route.
3. *Ruled out:* **blocking calls in async routes.** The database driver is `asyncpg` (fully async), and no route makes synchronous network calls on the request path.

**Why the two runs differ.** The code was identical, so the difference comes from the hosting environment: shared or burstable Azure capacity, or other traffic at the time. It means one run is not enough evidence on its own, which is why both are kept.

**Fixes (branch `sprint3/athalia-rules-api`, not yet deployed at run 2):**

| Change | File |
|---|---|
| Run 2 worker processes: `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2` | `backend/startup.txt` |
| Pool of 10 + 5 overflow per worker (tunable via `DB_POOL_SIZE` / `DB_MAX_OVERFLOW`), `pool_pre_ping`, 30-minute recycle | `backend/app/database.py` |
| Startup table creation takes a Postgres advisory lock, so two workers booting together can't race | `backend/main.py` |

With 2 workers × 15 connections = 30 at most, this stays under the connection limit of Azure's smallest Postgres tiers. If you add workers, lower `DB_POOL_SIZE` so that workers × (pool + overflow) stays under your server's `max_connections`.

> **TODO (after deploying):** confirm the fix is live (`/openapi.json` lists `/reminders`). Set the Startup Command in the Azure portal (App Service → Configuration → General settings) to match `startup.txt`, since a command set there overrides the file. Then run the load test **twice** and add both results as runs 3 and 4. Target: p95 under 500 ms. If it's still far off, the next step is a larger App Service plan, which the Azure for Students credit may not cover. That would be documented as a known limit of the hosting budget.

**The single `500` in run 2.** One `GET /saved-filters` failed at 07:37 on 27 September, under full load. The response body doesn't say why.

> **TODO:** check the App Service **Log stream** (or Diagnose and solve problems → Application logs) around that time. A connection-pool timeout or a refused database connection would confirm cause 2 above.

### 2. Hosting region (US-3.16)

**Where it's hosted:** the API and frontend run as Azure App Service web apps in **UAE North**. Our users are in South Africa.

**Why UAE North.** The project is hosted on an **Azure for Students** subscription, which gives US$100 of credit for twelve months and restricts which regions resources can be created in. When we set up hosting, UAE North was the only nearby region that worked for us. Azure Static Web Apps, our first choice for the frontend, was blocked in the other regions we tried. Rather than hold up the sprint looking for a workaround, we stayed in UAE North and deployed the frontend and backend as App Service web apps there.

**Was it good enough?** Yes, for a single user. Median response was 143–160 ms across two runs, inside the ~200 ms target, with nothing over 500 ms. The cost of the choice is distance: about 125–130 ms of every request is the round-trip to the UAE.

**If we moved.** Azure has a **South Africa North** (Johannesburg) region. Hosting the API and database there should remove most of that round-trip; that's an estimate, not measured. It would require a subscription that allows the region. For now the latency target is met, so we are keeping UAE North and recording the trade-off here.

**Cold starts** were not isolated in these runs: the API had already been warmed up by earlier requests.

> **TODO:** run `latency --requests 5` after the app has been idle for 30+ minutes, and compare the first request with the rest. If the App Service plan supports **Always On**, enabling it stops the app being unloaded when idle; note whether the student plan allows it.

### 3. Validation status codes (US-3.15) — decided: keeping 422

Invalid input returns **422**, FastAPI's default for request validation errors, not the **400** named in the acceptance criteria.

**Decision: keep 422.** Two reasons. First, 422 Unprocessable Entity is the more semantically precise code here — "the request was well-formed, but its content fails validation" is exactly 422's definition, and 400 Bad Request is more properly for a request the server can't even parse (malformed JSON, wrong content type). Major APIs (GitHub, Stripe) draw the same distinction. Second, this is FastAPI's own convention for `RequestValidationError`, used consistently across every one of our endpoints and asserted on by 67 test cases across 12 test files — overriding it project-wide for a naming preference would be a wide, purely cosmetic change with real regression risk (every one of those assertions would need updating, in lockstep, with no functional benefit). Both 400 and 422 are members of the same "client error, don't retry unchanged" class the acceptance criteria cares about; the distinction the guidance actually warns against — **an unhandled crash returning 500** for input that should have been validated — does not occur anywhere in this API (see Finding 4 and 5 below, both now closed).

### 4. Unknown fields silently ignored (US-3.15) — fixed

Confirmed by both runs: `PUT /projects/{id}` returned `200` for 15 bodies containing only unknown fields. Request bodies accepted and ignored fields the schema didn't define (`additionalProperties` was not `false` on `ProjectCreate`, `ProjectUpdate`, `EntryCreate`, `EntryUpdate`, `TaskCreate`, `TaskUpdate`, `ActivityCreate` and `SavedFilterCreate`). So a client typo such as `{"nmae": "x"}` used to succeed and change nothing.

**Fixed:** `model_config = ConfigDict(extra="forbid")` added to all eight models above in `backend/app/schemas.py` and `backend/app/routers/activities.py` — a typo'd or misspelled field now returns a clear `422` naming the offending field, instead of a silent no-op. `EntryCreate`/`EntryUpdate`'s own `data: dict[str, Any]` is deliberately unaffected — it's the user-defined schema payload and needs to stay free-form; `extra="forbid"` only closes off the *model's own* declared fields (`title`, `todo`, `due_date`, and so on), not the contents of `data`. Verified by 7 new regression tests (`test_create_project_rejects_an_unknown_field`, `test_update_project_with_only_unknown_fields_is_rejected_not_a_silent_noop`, `test_create_task_rejects_an_unknown_field`, `test_create_entry_rejects_an_unknown_top_level_field`, and their oversized-description counterparts below) in `test_routers_projects.py`, `test_tasks.py` and `test_entries.py`.

### 5. Descriptions have no size limit (US-3.15) — fixed

Confirmed by run 2: a 100,000-character `description` was accepted by `POST /projects/{id}/tasks` (3/3 attempts) and `PUT /projects/{id}` (3/3). Every other text field was capped: titles and names at 255 characters, filter names at 100, calendar activity descriptions at 4,000. Without a cap, one request could store arbitrarily large text that every later read of the project or task has to send back.

**Fixed:** `max_length=4000` added (matching `ActivityCreate.description`, which already had it) to `description` on `ProjectCreate`, `ProjectUpdate`, `TaskCreate` and `TaskUpdate` in `backend/app/schemas.py`. An oversized description now returns `422` instead of saving. Verified by `test_create_project_rejects_an_oversized_description`, `test_update_project_rejects_an_oversized_description` and `test_create_task_rejects_an_oversized_description`.

### 6. Development login is disabled in production

`POST /auth/dev-login` appears in the API's route list, but it is gated by `ENABLE_DEV_LOGIN`, which defaults to `false` and returns an error unless set. Azure Application Settings must never set it; `.env.example` says so. Worth confirming in the portal before the final demo.

## Accessing the API from outside the app (US-3.15)

- **Interactive docs (Swagger UI):** `/docs` on the base URL. **Machine-readable spec:** `/openapi.json`.
- **Public routes:** `GET /health` and the `/auth/*` login routes. **Everything else needs a logged-in user.**
- **Getting an access token for scripts:** log in through the app, then send the `chronicles_refresh` cookie to `POST /auth/refresh`. The response contains an access token for the protected routes. Session requests are only accepted from trusted origins, so the request must include the frontend's `Origin` header. `load_test.py` does all of this automatically.

## Reproducing these results

```powershell
$env:API_BASE_URL = "https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net"
$env:CHRONICLES_REFRESH = "<chronicles_refresh cookie value from the browser>"

python chronicles-logbook/scripts/load_test.py latency --requests 20
python chronicles-logbook/scripts/load_test.py robustness --rounds 3
python chronicles-logbook/scripts/load_test.py load --requests 1000 --concurrency 50

Remove-Item ~\.chronicles_load_test_session   # delete the saved login afterwards
```

The script creates a project called **"Load test (safe to delete)"** and runs all write tests inside it. Delete that project in the app when you're done.

**Known gap in run 1:** `GET /calendar/activities` was called without its required `start`/`end` dates and returned 422 every time, so it has no timing data in that run. Fixed for run 2.