# Decisions: platform, delivery and tooling

How the code is built, checked and shipped, and why. Format as in
[Data and backend](data-and-backend.md). Package-by-package choices are in
[Third-Party Code](../development/third-party-code.md); how work is organised is in
[Project Methodology](../methodology/project-methodology.md) and the
[Git Workflow](../methodology/git-workflow.md). This page covers the rest.

## Continuous integration

### PL-01. CI and deploy run on a self-hosted Windows runner, using its own Python and Node

- **Decided:** Gitea Actions on a Windows runner. Jobs call the runner's pre-installed Python and Node; there
  are no `actions/setup-python` or `actions/setup-node` steps.
- **Why:** `setup-python` "repeatedly damaged the Python installation on the self-hosted Windows runner", and
  `setup-node` needs administrator rights on a Windows host runner. A version check at the start of the job
  fails fast with a clear message if the wrong interpreter is picked up. Anything pip-installed on the runner
  also went into the runner's own Python and never into the deploy zip, so those steps changed nothing that
  was deployed.
- **Where:** `.gitea/workflows/ci.yml`, `deploy.yml`, `deploy-docs.yml`.

### PL-02. Artifact actions are pinned to version 3

- **Decided:** `upload-artifact@v3` and `download-artifact@v3`.
- **Why:** v4 depends on a newer artifact backend that Gitea's runner does not support ("GHES not supported",
  `CreateArtifact` timeouts).

### PL-03. Coverage and badge logic is Python, not shell

- **Decided:** coverage percentage extraction, per-file tables and badge publishing are Python scripts under
  `scripts/`.
- **Why:** inline bash steps broke on the Windows runner when a step overridden to `bash` ran inside a job
  defaulting to `cmd` ("coverage.sh: No such file or directory"). Python "runs identically under any shell".

### PL-04. Coverage is reported by our own scripts, not a service

- **Decided:** a self-hosted SVG badge generator, a per-file table (worst first, files under 80% flagged) and a
  pull-request comment posted through the Gitea API, which updates its own earlier comment instead of adding a
  new one per push.
- **Why:** Codecov does not support Gitea as a source host, and the Gitea instance is not publicly reachable, so
  an external badge service could not read it. Badge commits carry `[skip ci]` so that publishing a badge does
  not start another run.
- **Where:** `scripts/badge.py`, `coverage_table.py`, `extract_coverage.py`, `post_coverage_comment.py`,
  `publish_badges.py`.

### PL-05. Generated and local files are not tracked

- **Decided:** coverage output, a local Node binary directory and a 47 MB `frontend.zip` were removed from the
  tree and ignored; the workspace's pinned Node lives in an ignored `.dev-tools/`.
- **Why:** CI regenerates coverage every run, so a committed copy is stale on arrival; a careless `git add -A`
  once nearly committed a ~120 MB binary. The history still holds the old blobs; checkouts are smaller.
- **Where:** `.gitignore`.

### PL-06. Lint is ruff (backend) and oxlint (frontend), with a committed configuration

- **Decided:** `[tool.ruff]` in `pyproject.toml` selects ruff's defaults plus `I` (import order) and `B`
  (bugbear). `E402` is ignored in `conftest.py`, where import order is deliberate. Line length is not enforced.
  `Depends(...)` defaults carry `# noqa: B008`; a re-raise that drops its cause carries `from None` with a
  comment saying why.
- **Why:** before the config existed each developer linted against whatever their machine had while CI used the
  bare defaults, so warnings appeared locally that CI never saw. Bugbear was "already the intended standard"
  (the existing `noqa` comments showed it). A line-length rule would flag a lot of existing code "for no
  correctness benefit". Tool choice: [Testing](../development/testing.md#the-testing-tools-and-why-each-one).
- **State:** `oxlint` exits 0; it reports a few pre-existing warnings (unused variables, hook dependencies) in
  code outside this week's changes.

### PL-07. Test dependencies live in `requirements-dev.txt`

- **Decided:** a separate dev requirements file that includes the main one.
- **Why:** they had existed only inside `ci.yml`, so a fresh clone could install the application but not run the
  suite.

### PL-08. Tests get a generous time budget

- **Decided:** a 60-second test and hook timeout in `vitest.config.js`.
- **Why:** many files render the whole app, and on a cold CI runner after `npm ci` the default 5 s is far too
  tight; a large, correct test was failing intermittently. "It is not a slow test; it is a large one, and the
  budget now says so." Flaky assertions that raced an effect-based `Escape` listener were changed to `waitFor`.
- **Where:** `vitest.config.js`.

## Deployment

### PL-09. Deploy ships source, and Azure builds it

- **Decided:** the backend job zips the checked-out source and Azure installs dependencies itself during its
  Oryx build (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`).
- **Why:** it is the only way the dependencies end up in the deployed app (see PL-01). An earlier attempt to
  build on Linux so the virtual environment would work in Azure, and another to use a packaged action, were
  replaced.

### PL-10. The zip deploy is asynchronous, with polling

- **Decided:** `isAsync=true`, then poll the returned status URL.
- **Why:** a synchronous Kudu `zipdeploy` blocks until Oryx has installed dependencies, which for this app
  routinely exceeds the platform gateway's own ~230 s timeout and fails the job with a 504 **even when the
  deployment goes on to succeed**. Polling reports the real outcome.

### PL-11. Two uvicorn workers

- **Decided:** `uvicorn main:app --workers 2` in `startup.txt`.
- **Why:** introduced with the load work (US-3.18), which found requests queueing behind one worker and the
  connection pool (DB-53). Two workers raise throughput but mean start-up code has to be safe to run twice
  (DB-52) and in-memory state cannot be shared.

### PL-12. The documentation is its own site and its own workflow

- **Decided:** MkDocs Material, published as a separate Azure web app, rebuilt only when `docs/` or
  `mkdocs.yml` change; `use_directory_urls: false`.
- **Why:**
  - *Own workflow:* path filters apply per workflow, not per job, so this way the docs rebuild only when they
    change, not on every push to `main`, and "the published site cannot drift from the repository".
  - *Own site:* Gitea has no Pages hosting, and the brief wants a public documentation site on static hosting.
  - *File-based URLs:* the site is served by `pm2 serve`, which has no directory-index handling, so every page
    except the home page failed with `EISDIR` until pages were emitted as `entries.html` instead of
    `entries/index.html`.
  - *`site\*` in the zip:* it is extracted straight into `wwwroot`, so `index.html` must be at its root.
  - *The publish profile is validated before it is parsed:* a malformed attribute made PowerShell print the
    whole profile (and the secret's structure) into the log; empty values, a byte-order mark and a profile with
    no `ZipDeploy` entry are now each reported as one actionable line.
- **Where:** `deploy-docs.yml`, `mkdocs.yml`.

### PL-13. The frontend is a static bundle served with an SPA fallback

- **Decided:** `vite build`, then `serve -s dist` on App Service.
- **Why:** `serve` is the smallest thing that hosts a static bundle with a fallback to `index.html` for client
  routes ([Third-Party Code](../development/third-party-code.md)).

### PL-14. Hosting is in UAE North

- **Decided and argued:** [API Performance, hosting region](../testing/api-performance.md#2-hosting-region-us-316).
  In short: the Azure for Students subscription limited which regions could be used, and UAE North was the only
  nearby region that worked; the cost is about 125 to 130 ms of round trip per request.

### PL-15. Secrets are never committed, and the frontend knows only its API address

- **Decided:** all secrets are environment variables (Azure Application Settings in production, a git-ignored
  `backend/.env` locally), `VITE_API_URL` is the one build-time setting the frontend needs (a second, `VITE_ENABLE_DEV_LOGIN`, is for local development only), and `.env.example` holds placeholders.
- **Why:** a live Gemini key was once committed in `.env.example` (DB-60). `.env` loading uses an explicit path
  because the no-argument `load_dotenv()` inspects the call stack and silently fails inside `uvicorn --reload`'s
  spawned child on Windows.
- **Where:** `app/config.py`, `.env.example`.

## Dependencies and the repository

### PL-16. `pydantic` is `>=2.12.5,<3`, not pinned

- **Why:** the earlier pin (2.9.2) conflicted with `google-genai`, which requires 2.12.5 or later, making
  `requirements.txt` impossible to resolve; fresh clones, CI and Azure's Oryx build all failed.

### PL-17. The frontend declares Node 20 or newer, and `better-sqlite3` was removed

- **Decided:** `engines: { node: ">=20" }`, and `better-sqlite3` dropped.
- **Why:** nothing imported it, its native install script broke `npm ci` on machines without build tools, and
  the package itself needed Node 22. Vite 8 and Vitest 4 need Node 20 or later, so older runtimes used to fail
  with a cryptic `styleText is not exported` error; declaring it makes the failure obvious.
- **State:** `cors`, `dotenv`, `express`, `supertest`, `concurrently` and `nodemon` are still declared and
  unused (left from when a small Express service was considered). Removing them means regenerating the lock file
  that CI installs from, so it was left for a quieter moment than the run-up to a submission.

### PL-18. Migration files are numbered, and a clash is a bug

- **Decided:** `001` to `022`, one change per file.
- **Why:** two feature branches each numbered their migration `004`, which is how the second was overlooked in a
  merge and left a column out of production; the later one became `005`.

### PL-19. Branches and commits name roles, not people

- **Decided:** branch and log names use a workstream (for example `person4-sprint3`), not a real name.
- **Why:** it matches the team's existing convention; two old commit bodies still say a name, and were left
  because rewording them would mean rewriting the whole branch's history for a wording nit.
- **Related:** [Git Workflow](../methodology/git-workflow.md) (commit format, linking issue numbers).

### PL-20. AI use is declared on the page and in the commit

- **Decided:** each document carries an "AI Declaration" line, and commits carry an `Assisted-by` or
  `Co-Authored-By` trailer naming the tool and model.
- **Why:** the course brief requires attributing the tool, the model and the purpose, and says the team is
  responsible for everything generated and used.
- **Where:** the end of most documents; commit trailers.

### PL-21. The documentation toolchain is `mkdocs-material` and `pymdown-extensions`

- **Decided:** these two, in `docs/requirements.txt`.
- **Why:** the brief suggests a pre-established Markdown docs tool and static hosting; MkDocs Material gives
  search, navigation and Mermaid support (the extra script is loaded from a CDN) with no code to write.
  `attr_list` and `md_in_html` are enabled so headings can carry explicit ids, which the decision pages use to
  give stable links.
- **Where:** `mkdocs.yml`, [Third-Party Code](../development/third-party-code.md).

## Keeping the documentation true

### PL-22. A script checks the docs against the code

- **Decided:** `scripts/docs_audit.py` compares the running app against the documentation and lists routes whose
  method is not mentioned, database tables missing from the database page, migrations nobody mentions, and
  environment variables that are not documented.
- **Why:** the page said whatever was true on the day it was written and then fell behind. On 2026-10-09 it
  found seven undocumented routes, five undocumented tables and seven unmentioned migrations (all since
  added). It is a script to run before a release, not a CI gate. *Making it a gate is a possible next step.*
- **Run it:** `cd chronicles-logbook/backend && ./venv/Scripts/python.exe ../scripts/docs_audit.py`
  (on macOS or Linux, `venv/bin/python`).
