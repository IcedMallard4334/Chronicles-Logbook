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
| CORS errors | Ensure `CORS_ORIGINS` includes your frontend URL |
| Node.js version error | Upgrade to Node.js 20+ (`node --version` to check) |
