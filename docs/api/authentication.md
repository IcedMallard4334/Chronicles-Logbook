# Authentication

The API uses **JWT** (JSON Web Tokens) for session management. Users can authenticate with either a password-based account or Google OAuth 2.0.

Tokens are signed with `HS256` using the `JWT_SECRET_KEY` environment variable and are returned in API responses (password flows) or via the OAuth callback redirect hash (Google flow). The frontend stores the token in `localStorage` and sends it as `Authorization: Bearer <token>` on every request.

## Endpoints

### `POST /auth/register`

Create a new password-based account.

**Body:**

```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secure-password"
}
```

**Response:** `201 Created`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "avatar_url": null,
    "created_at": "2026-01-15T10:00:00+00:00"
  }
}
```

**Errors:** `409` if an account with that email already exists.

---

### `POST /auth/login`

Sign in with email and password.

**Body:**

```json
{
  "email": "jane@example.com",
  "password": "secure-password"
}
```

**Response:** `200 OK` — same shape as `/auth/register`.

**Errors:** `401` for invalid credentials.

---

### `POST /auth/forgot-password`

Request a password reset email. This endpoint does not reveal whether the email belongs to an account.

**Body:**

```json
{
  "email": "jane@example.com"
}
```

**Response:** `200 OK`

```json
{
  "message": "If an account exists for this email address, a password reset link has been sent."
}
```

---

### `POST /auth/reset-password`

Reset a password using a token from the reset email.

**Body:**

```json
{
  "token": "raw-reset-token",
  "password": "new-secure-password"
}
```

**Response:** `200 OK`

```json
{
  "message": "Password reset successfully."
}
```

**Errors:** `400` for invalid, expired, or already-used tokens.

---

### `GET /auth/google/login`

Redirects the user to Google's OAuth consent screen. Returns `503` if Google OAuth is not configured.

**Response:** HTTP 302 redirect to Google.

---

### `GET /auth/google/callback`

Handles the OAuth callback from Google. Exchanges the auth code for user info and issues a JWT, returning it to the frontend via redirect to `FRONTEND_URL/auth/callback#token=<jwt>`.

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
  "avatar_url": null,
  "created_at": "2026-01-15T10:00:00+00:00"
}
```

**Errors:**

| Status | Description |
|---|---|
| `401` | Missing or invalid token |

---

### `DELETE /auth/account`

Permanently deletes the authenticated user's account, password credentials, and reset tokens. Cascades to all projects, entries, and tasks owned by the user.

**Headers:** `Authorization: Bearer <token>`

**Response:** `204 No Content`

**Errors:** `401` if not authenticated.

---

## Using the token

Include the JWT in the `Authorization` header for all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```
