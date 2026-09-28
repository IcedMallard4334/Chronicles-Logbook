# API Reference — overview

Chronicles' API documentation is split into two halves, because they answer two
different questions and are aimed at two different audiences.

## 1. Our API (externally available to you)

Everything under **API Reference** below — Authentication, Projects, Schema and
field types, Entries, Tasks, Rules/recurrence/reminders, Statistics, Sharing,
and Export/import — documents **our own backend API**, hand-written in FastAPI,
deployed and reachable over the public internet. This is the API a grader,
another developer, or a script can call directly.

| | |
|---|---|
| **Base URL** | `https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net` |
| **Interactive docs** | `/docs` (Swagger UI) — try every endpoint from the browser |
| **Machine-readable spec** | `/openapi.json` |
| **Health check (public, no auth)** | `GET /health` |
| **Auth** | Short-lived bearer token (`Authorization: Bearer <token>`) obtained via Google OAuth or `POST /auth/refresh`; see [Authentication](authentication.md) |

All routes other than `/health` and the `/auth/*` sign-in routes require a
logged-in user. See [Accessing the API from outside the app](../testing/api-performance.md#accessing-the-api-from-outside-the-app-us-315)
for exactly how to obtain a working token as an external caller, and
[API Performance, Load & Robustness](../testing/api-performance.md) for
latency, load-testing and error-handling evidence against this same
deployment.

## 2. External APIs we consume (someone else's API, called from our backend)

Separately, Chronicles' **backend** calls out to four external services on
the internet — none of the frontend does this directly, everything goes
through our own API first. This is a completely different relationship:
we are the client, not the server, and we don't control uptime, latency or
pricing for these.

See **[External Services & Integrations](external-services.md)** for the full
detail — exact URLs, why each one exists, what data crosses the boundary, and
what happens if it's unavailable — covering:

1. **Google OAuth 2.0 / OpenID Connect** — sign-in.
2. **Google Calendar API** — optional, read-only calendar sync.
3. **Google Gemini API** — Mira, the AI assistant (consent-gated).
4. **Resend** — the account-deletion confirmation email.
