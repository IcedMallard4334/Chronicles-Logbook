# API Performance, Load & Robustness

Covers **US-3.15** (API robustness), **US-3.16** (latency & hosting) and **US-3.18** (load & stress testing).

## How we tested

All tests use `chronicles-logbook/scripts/load_test.py` (endpoint list in `load_test_endpoints.json`). It calls the **deployed API directly over HTTP** — never through the UI — and writes every run to `docs/evidence/` as a summary (`.md`) plus raw per-request data (`.csv`).

| | |
|---|---|
| **Target** | `https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net` (Azure App Service, UAE North) |
| **Client** | Home connection in Johannesburg, South Africa |
| **Date** | 27 September 2026 |
| **Routes covered** | 11 read routes (projects, entries, tasks, search, saved filters, statistics, calendar, auth) and 6 write routes |
| **Deliberately excluded** | `/ai/chat` (paid per call), `/calendar/google/*` (calls Google), `/export` and `/import` (bulk operations), all `DELETE` routes |

Three modes:

- **Latency**: 20 sequential requests per route, no concurrency. Measures what a single user experiences.
- **Load**: 1,000 requests, 50 in flight at once, randomly spread across the read routes.
- **Robustness**: sends malformed bodies (no body, invalid JSON, wrong top-level type, missing fields, unknown fields, oversized values) to every write route, then checks the API is still healthy.

## Results

### Latency (single user): meets the target

| Metric | Result | Target |
|---|---|---|
| Median across all routes | **143 ms** | ~200 ms |
| Requests over 500 ms | **0 / 200** | none |
| Slowest route (p95) | `GET /statistics`, 260 ms | < 500 ms |
| First request on a new connection | 761–962 ms | — |

`/health` alone takes ~124 ms, and it does no database work. So most of each response time is the **network round-trip from Johannesburg to UAE North**, not server processing. The ~800–950 ms first request is the one-off cost of opening a new HTTPS connection over that distance. Browsers reuse the connection, so a user pays it once per session, not on every click.

Evidence: `docs/evidence/latency-20260927-053410.md`

### Load (50 concurrent requests): no failures, but slow

| Metric | Result |
|---|---|
| Requests | 1,000 |
| Errors / timeouts | **0 (0.00%)** |
| API healthy after the burst | Yes |
| Throughput | **21.3 requests/second** |
| Median response per route | 1.7–2.3 s |
| p95 per route | 5.2–8.0 s |
| Worst single response | 15.3 s |

The API never broke under load, but response times grew roughly 15x compared with a single user.

Evidence: `docs/evidence/load-20260927-053540.md`

### Robustness (malformed input): no crashes

| Metric | Result |
|---|---|
| Malformed requests sent | 162 |
| Answered with 5xx / timed out | **0** |
| API healthy afterwards | Yes |
| Status returned for rejected input | `422 Unprocessable Entity` (FastAPI's default validation error, which lists each invalid field) |

Every write route rejected every malformed body, with one exception. `PUT /projects/{project_id}` returned `200` for 15 bodies that contained *only* unknown fields (e.g. `{"title": 12345}`). All of `ProjectUpdate`'s fields are optional and unknown fields are ignored, so these became no-op updates rather than errors.

Evidence: `docs/evidence/robustness-20260927-053447.md`

## Findings and what we're doing about them

### 1. Throughput bottleneck under concurrent load (US-3.18)

**Finding.** At 50 concurrent requests the API handles ~21 requests/second and p95 latency reaches 5–8 s. `/health` also slowed down under load (p95 4.5 s), and it does no database work. So requests are **queuing before they reach the route handlers**: the limit is how many requests the server can process at once, not one slow query.

**Likely causes, to check in this order:**

1. **Single worker process.** Check the App Service startup command. `uvicorn main:app` runs one process; `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app` runs four.
2. **Blocking calls inside `async def` routes.** A synchronous database driver or `requests` call inside an `async def` handler blocks the whole event loop, so every other request waits. Either make those handlers plain `def` (FastAPI then runs them in a thread pool) or switch to an async driver.
3. **App Service plan size.** A small plan has limited CPU. Scaling up temporarily and re-running the test shows whether this is the ceiling.
4. **Database connection pool.** Check that connections are pooled and that the database is in the same region as the API.

**Plan.** Apply the fixes one at a time, re-running `load_test.py load --requests 1000 --concurrency 50` after each, and record each result here. Target: p95 under 500 ms at this load.

### 2. Hosting region (US-3.16)

**Current:** Azure **UAE North**. **Our users:** South Africa. Azure has a **South Africa North** (Johannesburg) region.

Since ~124 ms of every request is network distance, moving the API and database to South Africa North should remove most of that round-trip. That would bring typical responses well under the 200 ms target and shrink the first-connection delay.

> **TODO (team):** record why UAE North was chosen (e.g. subscription region restrictions, cost, service availability), and either migrate or keep it with that justification. If migrating, re-run `latency` and add the before/after here.

**Cold starts** were not isolated in these runs: the API had already been warmed up by earlier requests. To measure them, run `latency --requests 5` after the app has been idle for 30+ minutes and compare the first request with the rest. If the App Service plan supports **Always On**, enabling it prevents the app being unloaded when idle.

### 3. Validation status codes (US-3.15)

Invalid input returns **422**, FastAPI's default for request validation errors, not the **400** named in the acceptance criteria. 422 is the more specific standard code for "well-formed request, invalid content", and FastAPI's error body names each offending field.

> **TODO (team):** decide whether to keep 422 (and say so in the API docs), or add an exception handler for `RequestValidationError` that returns 400 with the same error body.

### 4. Unknown fields silently ignored (US-3.15)

Request bodies accept and ignore fields the schema doesn't define (`additionalProperties` is not `false` on `ProjectCreate`, `ProjectUpdate`, `EntryCreate`, `TaskCreate`, `ActivityCreate`, `SavedFilterCreate`). So a client typo such as `{"nmae": "x"}` on `PUT /projects/{id}` succeeds and changes nothing. Setting `model_config = ConfigDict(extra="forbid")` on these request models would turn it into a clear 422. `FilterCriteria` already does this.

### 5. Fields with no size limit

`ProjectCreate.description`, `ProjectUpdate.description`, `TaskCreate.description` and `EntryCreate.data` have no maximum length, while every other text field has one (255 characters, or 100 for filter names). The next robustness run tests these fields individually. If it shows 100,000-character values being accepted, add a `max_length` to them.

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

**Known gap in the 27 September runs:** `GET /calendar/activities` was called without its required `start`/`end` dates and returned 422 every time, so it has no timing data in those runs. The endpoint list has since been fixed.