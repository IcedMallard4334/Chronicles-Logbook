"""
Auth route STUBS.

Deliberately not implemented here — Ethan owns US4 end-to-end (sign up, sign
in) and per the project brief, auth "must rely on established practices and
libraries" (e.g. passlib for hashing + python-jose for JWTs, or a library
like Authlib) rather than a hand-rolled scheme. That's Ethan's decision to
make, not something to bake into the skeleton.

These stubs exist so:
  1. The route paths are locked in from day one — Ethan builds the sign-up/
     sign-in forms' fetch() calls against POST /auth/signup and
     POST /auth/signin without waiting on this file to change.
  2. `python -m pytest` / manual testing can confirm the router wiring works
     before real logic lands.

They return 501 Not Implemented rather than a 404, to make it obvious in
network tab / Postman that the route exists but is intentionally unfinished.
"""
from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/auth", tags=["auth"])


class NotImplementedYetError(APIError):
    status_code = 501
    code = "NOT_IMPLEMENTED"


@router.post("/signup")
def signup():
    # TODO(Ethan, US4): hash password (passlib), create User row, return
    # a session token or start a session per whatever auth library is chosen.
    raise NotImplementedYetError("Sign up not implemented yet — see US4.")


@router.post("/signin")
def signin():
    # TODO(Ethan, US4): verify credentials, issue token/session.
    raise NotImplementedYetError("Sign in not implemented yet — see US4.")
