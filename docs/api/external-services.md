# External Services & Integrations

Four external, third-party APIs. All four are called **only from our
backend** — the frontend never talks to any of them directly, it always goes
through our own API first. That boundary is deliberate: it means the frontend
never needs third-party credentials, and every external call goes through our
own authentication, validation and error handling first.

No payment, analytics, or other third-party service beyond the four below is
used anywhere in Chronicles.

---

## 1. Google OAuth 2.0 / OpenID Connect — sign-in

**Why we need it.** Chronicles has no password system of its own. Building and
securing one — hashing, reset flows, breach detection — is a whole subsystem
that an established identity provider already solves correctly. Google was
chosen because our users (university students) already have a Google account.

**URLs called:**

| Purpose | URL |
|---|---|
| Start sign-in (browser redirect) | `https://accounts.google.com/o/oauth2/v2/auth` |
| Exchange the authorization code for tokens | `https://oauth2.googleapis.com/token` |
| Fetch the verified identity (name, email, avatar) | `https://openidconnect.googleapis.com/v1/userinfo` |

**Flow** (implemented in `chronicles-logbook/backend/app/routers/auth.py`):

1. React sends the browser to our own `GET /auth/google/login`.
2. Our backend (via [Authlib](https://authlib.org)) redirects to Google's
   `accounts.google.com` authorization URL with our `GOOGLE_CLIENT_ID` and the
   scopes we ask for (`openid email profile`).
3. The user signs in and consents **on Google's site**, not ours — we never
   see or handle their Google password.
4. Google redirects back to our `GET /auth/google/callback` with a one-time
   authorization code.
5. Our backend exchanges that code for tokens at `oauth2.googleapis.com/token`,
   then calls `openidconnect.googleapis.com/v1/userinfo` to get the verified
   name, email and avatar URL.
6. We create or update our own `users` row from that identity and issue our
   **own** short-lived session token — from this point on, the frontend only
   ever talks to our API, never to Google again for the rest of the session.

**What we send Google:** nothing about the user beyond the standard OAuth
redirect (our client ID, requested scopes, and a callback URL). **What we get
back:** name, email address and profile photo URL — nothing else.

**Configuration:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`OAUTH_REDIRECT_URI` (backend environment). Full local-vs-Azure setup is in
[Authentication and Azure configuration](../architecture/authentication-and-azure.md).

**If it's unavailable:** nobody can sign in — this is the one integration
Chronicles cannot function without. A local development bypass exists
(`POST /auth/dev-login`, gated behind `ENABLE_DEV_LOGIN`, which defaults to
`false` and is never set in production) for working on the app without a
registered Google OAuth client.

**Cost / outsourcing:** free, no quota we could realistically hit. Not
something we would build ourselves — replacing it would mean adopting a
*different* identity provider (or building password auth from scratch), not
removing external dependence entirely.

---

## 2. Google Calendar API — optional, read-only calendar sync

**Why we need it.** The brief asks for a record of work alongside a
"clear view of what is still unfinished" and a calendar of deadlines. Most
students already keep their commitments in Google Calendar; duplicating that
into a second calendar nobody checks would be worse than not building the
feature. Showing their existing calendar next to their logbook, instead of
asking them to maintain two, is the point of this integration — it's meant to
feel like part of the same product rather than a bolted-on widget.

**URLs called:**

| Purpose | URL |
|---|---|
| Request calendar access (separate consent from sign-in) | `https://accounts.google.com/o/oauth2/v2/auth` |
| Exchange the authorization code | `https://oauth2.googleapis.com/token` |
| Read events from the connected calendar | `https://www.googleapis.com/calendar/v3/calendars/primary` |

**Scope requested:** `https://www.googleapis.com/auth/calendar.readonly` —
**read-only**. Chronicles cannot create, edit or delete anything on a
connected Google Calendar; this is enforced by the scope itself, not just by
our own code choosing not to call write endpoints.

**Flow** (`chronicles-logbook/backend/app/routers/auth.py` and
`chronicles-logbook/backend/app/routers/calendar.py`):

1. From the Calendar view, "Connect Google Calendar" starts a **second**,
   separate OAuth grant (sign-in already happened) scoped only to
   `calendar.readonly`.
2. On approval, the backend stores a refresh token for that Google account
   against the signed-in user and exchanges it for a short-lived access token
   as needed at `oauth2.googleapis.com/token`.
3. The Calendar view's month grid reads events for the visible range from
   `googleapis.com/calendar/v3/calendars/primary` and merges them with
   Chronicles entries and any manually-added "activities" for the same day.

**Multiple accounts.** A user can connect more than one Google account and
toggle each one's visibility independently without disconnecting it.
"Disconnect" revokes and deletes that account's stored token.

**What we store:** an OAuth refresh token per connected account (needed to
keep reading events without asking the user to re-approve constantly) and
nothing else — event data is fetched live and not persisted.

**If it's unavailable:** the rest of the app is unaffected. This integration
is entirely optional and per-user — nobody is forced to connect a calendar,
and the app was designed so the Calendar view degrades to showing only
Chronicles' own entries and activities if the Google API call fails or a
user never connects an account.

**Cost / outsourcing:** free within Google's standard API quotas, which a
single-user personal calendar sync will never approach. Could be replaced
with a different provider's calendar API (e.g. Outlook/Microsoft Graph) with
a new implementation of the same read-only pattern; not something we would
build ourselves, since replicating a calendar service is out of scope for a
logbook.

---

## 3. Google Gemini API — Mira, the AI assistant

**Why we need it.** Mira is a thinking partner for turning a rough note into
a clear entry, planning a session, or shaping an idea into a project proposal
— a conversational feature that needs a language model, which is not
something to build in-house. Gemini was chosen for cost (a free tier
sufficient for a class project) and a straightforward Python SDK.

**URL called:** the Gemini API is called through Google's official
[`google-genai`](https://pypi.org/project/google-genai/) Python SDK
(`chronicles-logbook/backend/app/services/gemini_service.py`), which itself
talks to `generativelanguage.googleapis.com` — we don't construct that request
by hand. **Model:** configurable via `GEMINI_MODEL`, defaulting to
`gemini-3.5-flash-lite`.

**Consent-gated, unlike the other two.** Before any message reaches Gemini,
the user is asked to accept or decline (`GET`/`PUT /ai/consent`). Declining
keeps Mira available in a **local-only mode** that never calls Gemini at all
— `POST /ai/chat` short-circuits and returns a canned, locally-generated
reply instead of contacting Google. This is the one integration whose use is
opt-in per user, because it's the one that sends free-text content (whatever
the user types) to a third party.

**What we send Gemini:** the text the user typed into the Mira chat box,
plus a fixed system prompt (`SYSTEM_INSTRUCTION` in `gemini_service.py`)
telling it what it is and what it must not claim — notably, that it cannot
see the user's actual projects, entries, tasks or calendar, and must say so
rather than pretend otherwise. **What we get back:** either a text reply, or
a proposed `create_project` function call — a *suggestion only*. Calling that
function never creates anything; the proposal is shown to the user as a card
they must explicitly confirm in the UI, and only then does it become a real
`POST /projects` call against our own API.

**Error handling:** a missing API key raises `503 Service Unavailable`
(`GeminiNotConfiguredError`); a failed or malformed response from Gemini
raises `502 Bad Gateway` (`GeminiServiceError`) rather than crashing the
request or returning a raw provider error to the client.

**Configuration:** `GEMINI_API_KEY` / `GEMINI_MODEL` (backend environment).

**If it's unavailable:** every other feature of Chronicles works normally.
Mira itself degrades to `503` for users who *have* consented (a clear,
typed error, not a hang or a crash); users who declined consent never notice,
since they were never calling out to it anyway.

**Cost / outsourcing:** billed per token by Google, currently within the free
tier for our traffic. This is the one integration that could be swapped for
a different LLM provider (OpenAI, Anthropic, a self-hosted model) with
comparatively little work — it's isolated behind one ~110-line service
module (`gemini_service.py`) with a small, well-defined interface
(`generate_response(message) -> GeminiResponse`), so switching providers
means rewriting that one file, not touching routers, the frontend, or the
rest of the backend.

---

## 4. Resend — account-deletion confirmation email

**Why we need it.** When someone deletes their Chronicles account, the
data is gone immediately and permanently — a confirmation email is the one
piece of evidence they have afterwards that it actually happened, sent to an
address that (unlike the in-app UI) they can still check once the account no
longer exists.

**URL called:** [Resend](https://resend.com)'s API, via their official
[`resend`](https://pypi.org/project/resend/) Python package
(`chronicles-logbook/backend/app/services` → `app/email.py`), which itself
talks to `api.resend.com` — again, not a URL we construct by hand.

**Flow** (`DELETE /auth/account` in `app/routers/auth.py`): the account and
everything it owns is deleted from our own database **first**, then, as a
best-effort final step, `send_account_deleted_email` fires one transactional
email to the now-former user's address. If Resend is unreachable or
misconfigured, that failure is caught and logged, never raised back to the
client — the deletion itself has already succeeded and must not be reported
as failed just because a courtesy email didn't send.

**What we send Resend:** the user's email address and a fixed HTML template
confirming deletion. No other personal data — by the time this call happens,
none of it exists in our database any more.

**Configuration:** `RESEND_API_KEY` / `EMAIL_FROM` (backend environment).

**If it's unavailable:** account deletion still works correctly; the user
simply doesn't get the confirmation email. This is the only one of the four
integrations that is allowed to fail completely silently, because it happens
after the action it's confirming has already succeeded.

**Cost / outsourcing:** free within Resend's tier for our email volume
(one email per account deletion, not a frequent event). Easily replaced with
any other transactional email provider (SendGrid, Postmark, raw SMTP) — it's
a single function in a single file.

---

## Summary table

| Integration | Direction | Scope | Consent | Required for core app? |
|---|---|---|---|---|
| Google OAuth 2.0 | We call Google | Identity only (`openid email profile`) | Implicit in signing in | **Yes** — the only sign-in method |
| Google Calendar API | We call Google | Read-only calendar | Explicit, separate, per-account, revocable | No — optional, per user |
| Google Gemini API | We call Google | N/A (no OAuth; API key) | Explicit accept/decline, gates every call | No — Mira degrades to local-only mode |
| Resend | We call Resend | N/A (API key) | Implicit in deleting your account | No — deletion succeeds even if this fails |
