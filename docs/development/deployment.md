# Deployment

## Infrastructure Overview

```mermaid
graph TB
    subgraph Internet["Internet"]
        Browser[Browser / Mobile]
    end

    subgraph Azure["Microsoft Azure"]
        subgraph AppService["Azure App Service"]
            BE[Backend API<br/>FastAPI + uvicorn]
        end
        subgraph WebApp["Azure Web Apps"]
            FE[Frontend<br/>React static files]
        end
        subgraph DB["Azure Database"]
            PG[(PostgreSQL<br/>Flexible Server)]
        end
    end

    subgraph CICD["CI/CD (Gitea Actions)"]
        CI[ci.yml<br/>Lint, Test, Build]
        CD[deploy.yml<br/>ZipDeploy to Azure]
    end

    Browser -->|HTTPS| FE
    Browser -->|HTTPS / REST| BE
    BE -->|asyncpg| PG
    FE -->|fetch /api| BE
    CICD -->|on push to main| CD
    CD -->|ZipDeploy| BE
    CD -->|ZipDeploy| FE
```

| Component | Service |
|---|---|
| Backend API | Azure App Service (Python 3.12) |
| Frontend | Azure Web Apps (static files) |
| Database | Azure Database for PostgreSQL Flexible Server |
| CI/CD | Gitea Actions |
| Documentation | MkDocs static site |

## CI/CD Pipeline

```mermaid
flowchart LR
    subgraph PR["On Pull Request (ci.yml)"]
        BL[Backend Lint<br/>ruff] --> BT[Backend Test<br/>pytest]
        FL[Frontend Lint<br/>oxlint] --> FT[Frontend Test<br/>vitest] --> FB[Frontend Build<br/>vite build]
    end

    subgraph Deploy["On Push to main (deploy.yml)"]
        DB[Backend: Install + Zip] --> DD[Deploy to Azure<br/>App Service<br/>ZipDeploy]
        DF[Frontend: Build + Zip] --> DF2[Deploy to Azure<br/>Web Apps<br/>ZipDeploy]
    end

    PR -->|merge to main| Deploy
```

Gitea Actions workflows are configured in `.gitea/workflows/`. The CI pipeline runs on every push and pull request:

1. **Lint** — ruff (Python) and oxlint (JavaScript)
2. **Test** — pytest (backend) and vitest (frontend)
3. **Build** — production builds for both frontend and documentation
4. **Deploy** — push to Azure (main branch only)

### CI Configuration

The CI workflow (`.gitea/workflows/ci.yml`) runs two parallel jobs:

| Job | Steps |
|---|---|
| `backend` | Checkout → Python 3.12 → Install deps → ruff lint → pytest |
| `frontend` | Checkout → Node 20 → npm ci → oxlint lint → vitest → vite build |

### Deploy Configuration

The deploy workflow (`.gitea/workflows/deploy.yml`) runs two parallel jobs on push to `main`:

| Job | Steps |
|---|---|
| `deploy_backend` | Checkout → Python 3.12 → Install deps → Zip → ZipDeploy to Azure App Service |
| `deploy_frontend` | Checkout → Node 20 → npm ci → vite build → Zip → ZipDeploy to Azure Web Apps |

Deployment credentials are stored as Gitea repository secrets (`AZURE_BACKEND_PUBLISH_PROFILE`, `AZURE_FRONTEND_PUBLISH_PROFILE`).

## Backend Deployment

The FastAPI app is deployed to Azure App Service with Python 3.12. The startup command is defined in `startup.txt`:

```
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Azure PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `JWT_SECRET_KEY` | Yes | Production signing key (min 32 chars) |
| `SESSION_SECRET_KEY` | Yes | Session encryption key |
| `CORS_ORIGINS` | Yes | Production frontend URL |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `SMTP_HOST` | No | SMTP server for transactional emails |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `FRONTEND_URL` | No | Frontend base URL for OAuth redirects |

## Frontend Deployment

The React app is built with Vite and deployed as static files to Azure Web Apps:

```bash
npm run build   # Produces static files in dist/
```

The `VITE_API_URL` environment variable is injected at build time to point the frontend at the production backend.

## Documentation Deployment

The MkDocs site is built into a `site/` directory:

```bash
python -m mkdocs build   # Produces static files in site/
```

The built site can be deployed to any static hosting service (Gitea Pages, GitHub Pages, Cloudflare Pages).

## Database Migrations

For production Azure PostgreSQL deployments, schema changes are managed via SQL migration scripts in `chronicles-logbook/backend/migrations/`. The initial migration (`001_schema_updates.sql`) is idempotent and covers:

- `entries.time_spent` column addition
- `tasks.checklist` JSONB column addition
- Backwards-compatible column renames

Run migrations against your Azure PostgreSQL instance:

```bash
psql "postgresql://user:password@host:5432/dbname" -f migrations/001_schema_updates.sql
```

## Environment Configuration

| Environment | Frontend URL | Backend URL |
|---|---|---|
| Local development | `http://localhost:5173` | `http://localhost:8000` |
| Production | Azure Web Apps URL | Azure App Service URL |

AI Declaration: The preceding document was reviewed and edited with: Qoder
