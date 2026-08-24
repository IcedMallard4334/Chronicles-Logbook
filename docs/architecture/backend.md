# Backend

The backend is a **FastAPI** application running on Python 3.12+ with async SQLAlchemy ORM.

## Entry point

`chronicles-logbook/backend/main.py` creates the FastAPI app and registers all routers:

```python
app = FastAPI(title="Chronicles Logbook", version="1.0.0")

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(entries.router)
```

The app uses a **lifespan context manager** to create database tables on startup:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
```

## Router modules

| Router | Prefix | Responsibility |
|---|---|---|
| `auth` | `/auth` | Password registration/login, Google OAuth, password reset, current user, account deletion |
| `projects` | `/projects` | Project CRUD, archiving/unarchiving, entry management, schema definitions |
| `tasks` | `/projects/{project_id}/tasks` | Task CRUD, toggle completion, filtering, checklists |
| `entries` | `/entries` | Global entry search across projects |

## Authentication flow

### Password-based accounts

1. Frontend calls `POST /auth/register` or `POST /auth/login` with email and password.
2. Backend validates credentials, hashes passwords with bcrypt, and issues a signed JWT.
3. Frontend stores the JWT in `localStorage` and sends it as `Authorization: Bearer <token>` on every request.
4. Forgotten passwords are reset via `POST /auth/forgot-password`, which sends a time-limited link to the user's email; the link is consumed by `POST /auth/reset-password`.

### Google OAuth accounts

1. Frontend redirects the user to `/auth/google/login`.
2. Backend redirects to Google's OAuth consent screen.
3. Google redirects back to `/auth/google/callback` with an auth code.
4. Backend exchanges the code for a Google access token and user profile.
5. Backend creates or retrieves the user record and issues a signed JWT (returned via redirect hash to `/auth/callback`).
6. Frontend stores the JWT in `localStorage` and sends it as `Authorization: Bearer <token>` on every request.

## Key dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sqlalchemy[asyncio]` | Async ORM |
| `asyncpg` | PostgreSQL async driver |
| `pyjwt` | JWT token signing and validation |
| `httpx` | HTTP client for Google API calls and tests |
| `python-dotenv` | Environment variable loading |
| `pydantic` | Request/response validation |
| `authlib` | Google OAuth integration |
| `bcrypt` | Password hashing |
| `aiosqlite` | In-memory SQLite for tests |

## CORS configuration

CORS origins are configured via the `CORS_ORIGINS` environment variable (comma-separated). In production, this points to the Azure App Service URL.
