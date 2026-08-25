# Authentication

The API uses **JWT** (JSON Web Tokens) for session management. Users authenticate exclusively through **Google OAuth 2.0** — Chronicles does not store or manage passwords.

```mermaid
flowchart TD
    subgraph OAuth["Google OAuth"]
        GLogin[GET /auth/google/login]
        GCallback[GET /auth/google/callback]
    end

    subgraph Session["Session"]
        Me[GET /auth/me]
        Delete[DELETE /auth/account]
    end

    GLogin --> Google[Google Consent Screen]
    Google --> GCallback
    GCallback --> JWT[JWT Token]
    JWT --> Me
    JWT --> Delete
```

The JWT is signed with `HS256` using the `JWT_SECRET_KEY` environment variable and returned to the frontend via the OAuth callback redirect hash (`/auth/callback#token=<jwt>`). The frontend stores the token in `localStorage` and sends it as `Authorization: Bearer <token>` on every request.

Google manages passwords and password recovery. Chronicles never receives or stores a Google password.

## Endpoints

### `GET /auth/google/login`

Redirects the user to Google's OAuth consent screen. The `prompt=select_account` parameter is included so Google always shows the account chooser. Returns `503` if Google OAuth is not configured.

**Response:** HTTP 302 redirect to Google.

---

### `GET /auth/google/callback`

Handles the OAuth callback from Google. Exchanges the auth code for user info and issues a JWT, returning it to the frontend via redirect to `FRONTEND_URL/auth/callback#token=<jwt>`.

If the user's Google email is not verified, the callback redirects with `#error=...` instead.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `code` | string | Google OAuth authorization code |

---

### `GET /auth/me`

Returns the currently authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "created_at": "2026-01-15T10:00:00+00:00"
}
```

**Errors:**

| Status | Description |
|---|---|
| `401` | Missing or invalid token |

---

### `DELETE /auth/account`

Permanently deletes the authenticated user's account. Cascades to all projects, entries, and tasks owned by the user. A notification email is sent via Brevo SMTP.

**Headers:** `Authorization: Bearer <token>`

**Response:** `204 No Content`

**Errors:** `401` if not authenticated.

---

## Using the token

Include the JWT in the `Authorization` header for all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```
