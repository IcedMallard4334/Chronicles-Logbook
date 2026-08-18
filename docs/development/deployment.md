# Deployment

## Infrastructure

| Component | Service |
|---|---|
| Backend API | Azure App Service |
| Frontend | Azure Web Apps |
| Database | Azure PostgreSQL |
| CI/CD | Gitea Actions |

## CI/CD pipeline

Gitea Actions workflows are configured in `.gitea/workflows/`. The pipeline runs on every push and pull request:

1. **Lint** — ruff (Python) and oxlint (JavaScript)
2. **Test** — pytest (backend) and vitest (frontend)
3. **Build** — production builds for both frontend and documentation
4. **Deploy** — push to Azure (main branch only)

## Backend deployment

The FastAPI app is deployed to Azure App Service. The key environment variables:

- `DATABASE_URL` — Azure PostgreSQL connection string
- `JWT_SECRET_KEY` — production signing key
- `CORS_ORIGINS` — production frontend URL
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials

## Frontend deployment

The React app is built with Vite and deployed to Azure Web Apps:

```bash
npm run build   # Produces static files in dist/
```

## Documentation deployment

The MkDocs site is built into a `site/` directory:

```bash
python -m mkdocs build   # Produces static files in site/
```

The built site can be deployed to any static hosting service. For Gitea Pages, push the `site/` directory to a `pages` branch or configure Gitea Actions to deploy automatically.

### Manual deployment to Gitea Pages

```bash
# Build the docs
python -m mkdocs build

# Deploy using gh-import or ghp-import equivalent
python -m mkdocs gh-deploy  # If configured for GitHub Pages
```

## Environment configuration

| Environment | Frontend URL | Backend URL |
|---|---|---|
| Local development | `http://localhost:5173` | `http://localhost:8000` |
| Production | Azure Web Apps URL | Azure App Service URL |
