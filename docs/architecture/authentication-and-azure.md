# Authentication and Azure configuration

Chronicles uses a hand-written FastAPI API, Google OpenID Connect through Authlib for user
authentication, and PostgreSQL for application data. The deployed database is Azure Database for
PostgreSQL Flexible Server. Firebase and Supabase are not used.

## Authentication flow

1. React sends the browser to `GET /auth/google/login`.
2. FastAPI and Authlib redirect the user to Google OpenID Connect.
3. Google returns the verified identity to `GET /auth/google/callback`.
4. FastAPI creates or updates the local `users` record in PostgreSQL.
5. The callback returns a short-lived Chronicles session token to the React callback page.
6. React loads the profile from `GET /auth/me`.

Google manages passwords and password recovery. Chronicles never receives or stores a Google
password. A signed-in user can delete their local Chronicles account through
`DELETE /auth/account`.

## Local backend environment

Copy `backend/.env.example` to `backend/.env` and replace the placeholder values. Register this
local redirect URI in the Google Cloud OAuth client:

```text
http://localhost:8000/auth/google/callback
```

Keep `DATABASE_SSL=false` and `COOKIE_SECURE=false` for local HTTP development.

## Azure App Service environment

Configure these values in Azure App Service Application Settings. Never commit their real values:

```env
DATABASE_URL=postgresql+asyncpg://DB_USER:DB_PASSWORD@DB_SERVER.postgres.database.azure.com:5432/chronicles
DATABASE_SSL=true
CORS_ORIGINS=https://FRONTEND_HOST
SQL_DEBUG=false
JWT_SECRET_KEY=GENERATED_RANDOM_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=60
SESSION_SECRET_KEY=ANOTHER_GENERATED_RANDOM_SECRET
GOOGLE_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET
OAUTH_REDIRECT_URI=https://BACKEND_HOST/auth/google/callback
FRONTEND_URL=https://FRONTEND_HOST
COOKIE_SECURE=true
```

Register the exact Azure `OAUTH_REDIRECT_URI` in the same Google Cloud OAuth client. Configure the
frontend `VITE_API_URL` to the public Azure backend URL before building it.

## Course-requirement boundary

Google OpenID Connect satisfies authentication through an established provider and library. It
should not be treated as the project's required relevant external API feature. The GitHub commit
integration or Google Calendar task integration must still be implemented separately.

AI Declaration: The preceding document was reviewed and edited with: Qoder
