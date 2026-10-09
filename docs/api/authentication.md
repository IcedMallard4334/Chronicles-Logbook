# Authentication

Users sign in exclusively through **Google OpenID Connect**. Chronicles does not store or manage
passwords; Google manages passwords and recovery. A session is two things working together:

- a short-lived **access token** (a JWT) that the frontend keeps in `localStorage` and sends on every request;
- a longer-lived **session cookie** that lets the frontend ask for a fresh access token without sending
  the person back to Google, so closing and reopening a tab does not sign them out.

Why it is built this way is recorded in [Decisions: data and backend](../decisions/data-and-backend.md)
(DB-54 to DB-57).

```mermaid
flowchart TD
    subgraph OAuth["Google sign-in"]
        GLogin[GET /auth/google/login]
        GCallback[GET /auth/google/callback]
    end

    subgraph Session["Session"]
        Me[GET /auth/me]
        Refresh[POST /auth/refresh]
        Logout[POST /auth/logout]
        Delete[DELETE /auth/account]
    end

    GLogin --> Google[Google consent screen]
    Google --> GCallback
    GCallback --> JWT[Access token + session cookie]
    JWT --> Me
    JWT --> Refresh
    JWT --> Logout
    JWT --> Delete
```

## The two credentials

| | Access token | Session cookie |
|---|---|---|
| **What** | JWT signed with `HS256` using `JWT_SECRET_KEY` | A random 48-byte value; only its SHA-256 hash is stored (`login_sessions`) |
| **Lifetime** | `ACCESS_TOKEN_EXPIRE_MINUTES`, 60 by default | 30 days |
| **Where it lives** | `localStorage` (`chronicles_token`), sent as `Authorization: Bearer <token>` | An HTTP-only cookie named `chronicles_refresh`, path `/auth`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true` |
| **Delivered by** | The OAuth callback's redirect hash (`/auth/callback#token=<jwt>`), or the body of `POST /auth/refresh` | The OAuth callback response |

The cookie is only sent to `/auth/*` paths. A request that uses it (`refresh` and `logout`) must carry an
`Origin` header equal to `FRONTEND_URL`, otherwise it is refused with `403` ("Untrusted session request
origin"), so a page on another site cannot use someone's cookie.

An expired session or a user that no longer exists reads `401 Please sign in again.`

## Endpoints

### `GET /auth/google/login`

Redirects the user to Google's consent screen. `prompt=select_account` is included so Google always shows the
account chooser. The OAuth `state` is a **signed token** (a nonce and a JWT), not a server-side session, so it
survives the redirect chain whichever domain the app is reached on.

Returns `503` if Google OAuth is not configured.

**Response:** HTTP 302 redirect to Google.

---

### `GET /auth/google/callback`

Handles Google's redirect. Verifies the signed state, exchanges the code, then finds or creates the local user
(keyed on Google's stable subject id, refreshing name, email and photo), creates a session and redirects to
`FRONTEND_URL/auth/callback#token=<jwt>` with the session cookie set.

Every failure redirects to `FRONTEND_URL/auth/callback#error=<message>` instead of returning an error page, so the
app can show the reason. The cases are: an invalid state ("CSRF validation failed"); Google unreachable (the token
exchange is **tried twice**, 0.25 s apart, before giving up); a refused code exchange; no access token; a profile
that cannot be fetched; a profile without a verified name and email; and an email that already belongs to an
account with a different Google identity ("Use its existing sign-in method"), which stops a second Google identity
taking over an account just by sharing its email address.

| Query parameter | Type | Description |
|---|---|---|
| `code` | string | Google's authorisation code |
| `state` | string | The signed state issued by `/auth/google/login` |

---

### `POST /auth/dev-login`

**Local development only.** Signs in as any email without Google, finding or creating the user so local data
carries over between runs. Returns an access token and the user, and sets the session cookie.

It answers `404 Not found.` unless the backend's own `.env` sets `ENABLE_DEV_LOGIN=true`, so its existence is not
revealed anywhere that setting is off, which includes every Azure deployment. The sign-in page only offers it
when `VITE_ENABLE_DEV_LOGIN` is set, and that check is compiled out of a production build.

**Body:**

```json
{ "email": "dev@example.com", "full_name": "Dev Person" }
```

Both fields are optional (`dev@chronicles.local` is used when no email is given).

---

### `POST /auth/refresh`

Exchanges the session cookie for a new access token and the current user. Needs no `Authorization` header.

**Errors:** `401` if the cookie is missing, unknown or expired; `403` if the `Origin` is not the frontend's.

---

### `POST /auth/logout`

Deletes the server-side session and clears the cookie. `204 No Content`; it succeeds even if there is no session.
The frontend never silently restores a session after an explicit or offline sign-out.

**Errors:** `403` if the `Origin` is not the frontend's.

---

### `GET /auth/me`

Returns the currently authenticated user.

**Headers:** `Authorization: Bearer <token>`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "created_at": "2026-01-15T10:00:00+00:00"
}
```

**Errors:** `401` for a missing or invalid token.

---

### `DELETE /auth/account`

Permanently deletes the authenticated user's account and everything they own: projects, entries, tasks, rules,
saved filters, dashboards and so on (their sessions go with them). Work they contributed to *someone else's*
shared project stays, with the author cleared, because a shared record outlives its contributors.

A confirmation email is then sent through **Resend**. It is best-effort: if it fails, the account is still
deleted.

**Headers:** `Authorization: Bearer <token>`

**Response:** `204 No Content`. **Errors:** `401` if not authenticated.

---

### `GET /auth/google/calendar/callback`

The redirect target for connecting a Google Calendar (see [External services](external-services.md)). It sits
under `/auth` because that is the path registered in Google Cloud Console. It verifies a short-lived, signed
calendar state that is never accepted as an API access token, stores the refresh token, and redirects back to the
app. It is called by Google, not by the frontend.

## Using the token

Include the JWT in the `Authorization` header on every authenticated request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

When a request returns `401`, the frontend calls `POST /auth/refresh` once and replays the original request,
except after an explicit sign-out.

## Course requirements

The brief asks that users can sign up, sign in, reset their password and delete their account, using an
established provider and library. Here: **sign up and sign in** are both "Continue with Google" (the first
sign-in creates the account); **password reset** is Google's own recovery, since Chronicles holds no password;
**deletion** is `DELETE /auth/account`; the library is **Authlib** for the OpenID Connect flow and **PyJWT** for
our own access tokens.

AI Declaration: The preceding document was reviewed and edited with: Qoder. Rewritten from the code on
2026-10-09 with Claude Code (Sonnet 5.5).
