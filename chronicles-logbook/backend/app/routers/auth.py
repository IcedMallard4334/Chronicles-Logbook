"""
Auth route STUBS — locks in the route paths so anyone building against the
API (frontend fetch calls, Postman collections) doesn't have to wait for
full auth logic to land in a later story.

Per the project brief's key requirements, auth "must rely on established
practices and libraries" rather than a hand-rolled scheme (e.g. passlib for
hashing + python-jose/Authlib for tokens) — that decision belongs in the
story that actually implements sign up/sign in, not here.

Returns 501 rather than 404 so it's obvious in the docs / network tab that
the route is intentionally unfinished, not missing.
"""
from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/signup", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def signup():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Sign up not implemented yet.",
    )


@router.post("/signin", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def signin():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Sign in not implemented yet.",
    )
