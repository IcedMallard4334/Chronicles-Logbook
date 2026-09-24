# Running the Project

You need both the backend and frontend running simultaneously.

## Start the backend

From `chronicles-logbook/backend` with your virtual environment active:

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at [http://localhost:8000](http://localhost:8000).

!!! tip
    Interactive API documentation (Swagger UI) is available at [http://localhost:8000/docs](http://localhost:8000/docs). Use this to test endpoints directly.

## Start the frontend

From `chronicles-logbook/frontend`:

```bash
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

## Signing in locally without Google OAuth

The shared Google Cloud OAuth client only has `http://localhost:8000/auth/google/callback`
registered for whoever administers it, so "Continue with Google" may not work
on your machine even with the backend running correctly. To sign in anyway:

1. Add `ENABLE_DEV_LOGIN=true` to `chronicles-logbook/backend/.env`.
2. Restart the backend.
3. Open the sign-in page while the frontend is running via `npm run dev` — a
   "Local development" section appears below the Google button with a
   **Continue without Google** option.

Leave the email field blank to get a single shared dev account, or type an
email to sign in as someone specific — the same email always returns to the
same account, so your projects and entries persist between runs. This is
also how to test a shared project locally: mint a session for the owner in
one browser profile and for the invitee in another (or a private window),
using a different email each time.

This only ever works locally. The panel itself is built out of a production
bundle (`npm run build`) entirely — it doesn't render, disabled or
otherwise — and the backend refuses the request with a 404 unless
`ENABLE_DEV_LOGIN=true` is set, which must never be added to Azure
Application Settings.

## Running tests

=== "Backend"

    From `chronicles-logbook/backend`:

    ```bash
    # Run all tests
    python -m pytest

    # Run with verbose output
    python -m pytest -v

    # Run linter
    python -m ruff check .
    ```

=== "Frontend"

    From `chronicles-logbook/frontend`:

    ```bash
    # Run tests once
    npm run test -- --run

    # Run tests in watch mode
    npm run test

    # Run linter
    npm run lint

    # Create production build
    npm run build
    ```

## Environment variables

### Backend (`chronicles-logbook/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Async PostgreSQL connection string |
| `JWT_SECRET_KEY` | Yes | Secret for signing JWT tokens (min 32 chars) |
| `CORS_ORIGINS` | No | Comma-separated frontend origins (default: `http://localhost:5173`) |
| `SQL_DEBUG` | No | Log SQL statements (default: `false`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `ENABLE_DEV_LOGIN` | No | Local sign-in without Google (default: `false`) — see above. Never set on Azure. |

### Frontend (`chronicles-logbook/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Backend API URL (default: `http://localhost:8000`) |

## Troubleshooting

| Issue | Solution |
|---|---|
| `DATABASE_URL` not set | Check your `.env` file exists and has the correct format |
| Port 8000 in use | Change the `--port` flag or stop the conflicting process |
| Port 5173 in use | Vite will automatically try the next available port |
| CORS errors | First check what the request actually returned — see below. Then ensure `CORS_ORIGINS` includes your frontend URL |
| Node.js version error | Upgrade to Node.js 20+ (`node --version` to check) |

### "CORS errors" that are not CORS errors

A browser reports *any* response that reaches it without an
`Access-Control-Allow-Origin` header as a CORS failure — including responses
the CORS middleware never touched. So this message often means something else
entirely:

- **A 500 from the API.** An unhandled exception is returned by the server
  before the CORS middleware adds its headers, so a broken endpoint looks like
  a misconfigured origin. Check the server log for the traceback.
- **Something else is answering on port 8000.** `mkdocs serve` used to default
  to port 8000 as well, and on Windows its `127.0.0.1` bind takes precedence
  over uvicorn's `0.0.0.0` bind — so every API call silently went to the docs
  site, which answered `404` with no CORS headers. `dev_addr` in `mkdocs.yml`
  now pins the docs server to port 8001 to prevent this.
- **The backend is not running at all.** The request fails outright and the
  browser reports it the same way.

Confirm which it is before changing any CORS configuration:

```bash
# Should print 200 and the Chronicles API's health response
curl -i http://localhost:8000/health
```

If that returns anything other than the API's own `{"status": "ok"}`, the
problem is not CORS.

AI Declaration: The preceding document was reviewed and edited with: Qoder.
The "Signing in locally without Google OAuth" section and its `ENABLE_DEV_LOGIN`
row were added with Claude Code (Sonnet 5), documenting the `POST /auth/dev-login`
endpoint built in the same pass.
