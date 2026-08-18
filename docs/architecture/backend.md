# Backend

The backend is a **FastAPI** application running on Python 3.12+ with async SQLAlchemy ORM.

## Entry point

`chronicles-logbook/backend/main.py` creates the FastAPI app and registers all routers:

```python
app = FastAPI(title="Chronicles Logbook", version="1.0.0")

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
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
| `auth` | `/auth` | Google OAuth login, token exchange |
| `projects` | `/projects` | Project CRUD, entry management, schema definitions, archiving |
| `tasks` | `/projects/:id/tasks` | Task CRUD, toggle completion, filtering |

## Authentication flow

1. Frontend redirects user to Google OAuth consent screen
2. Google redirects back to `/auth/google/callback` with an auth code
3. Backend exchanges the code for a Google access token and user profile
4. Backend creates or retrieves the user record
5. Backend issues a signed JWT and returns it to the frontend
6. Frontend stores the JWT in memory and sends it as `Authorization: Bearer <token>` on every request

## Key dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sqlalchemy[asyncio]` | Async ORM |
| `asyncpg` | PostgreSQL async driver |
| `pyjwt` | JWT token signing and validation |
| `httpx` | HTTP client for Google API calls |
| `python-dotenv` | Environment variable loading |
| `pydantic` | Request/response validation |

## CORS configuration

CORS origins are configured via the `CORS_ORIGINS` environment variable (comma-separated). In production, this points to the Azure App Service URL.
