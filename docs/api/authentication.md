# Authentication

The API uses **Google OAuth 2.0** for user authentication and **JWT** (JSON Web Tokens) for session management.

## Endpoints

### `GET /auth/google/login`

Redirects the user to Google's OAuth consent screen.

**Response:** HTTP 302 redirect to Google.

---

### `GET /auth/google/callback`

Handles the OAuth callback from Google. Exchanges the auth code for user info and issues a JWT.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `code` | string | Google OAuth authorization code |

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

---

### `GET /auth/me`

Returns the currently authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@gmail.com",
  "display_name": "John Doe",
  "google_id": "1234567890",
  "created_at": "2026-01-15T10:00:00+00:00",
  "updated_at": "2026-01-15T10:00:00+00:00"
}
```

**Errors:**

| Status | Description |
|---|---|
| `401` | Missing or invalid token |

---

## Using the token

Include the JWT in the `Authorization` header for all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Tokens are signed with `HS256` using the `JWT_SECRET_KEY` environment variable.
