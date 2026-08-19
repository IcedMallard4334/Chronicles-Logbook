from urllib.parse import quote
from uuid import uuid4

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REDIRECT_URI,
)
from app.database import get_db
from app.models import PasswordCredential, User
from app.schemas import AuthResponse, PasswordLogin, PasswordRegister, UserResponse
from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)
oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID or None,
    client_secret=GOOGLE_CLIENT_SECRET or None,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _require_google_configuration() -> None:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured.",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = decode_access_token(credentials.credentials)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


@router.get("/google/login")
async def google_login(request: Request):
    _require_google_configuration()
    return await oauth.google.authorize_redirect(
        request,
        OAUTH_REDIRECT_URI,
        prompt="select_account",
    )


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_with_password(
    registration: PasswordRegister,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    existing_user = await db.scalar(
        select(User).where(User.email == registration.email)
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user_id = uuid4()
    user = User(
        id=user_id,
        full_name=registration.full_name,
        email=registration.email,
        google_sub=f"password:{user_id}",
    )
    db.add(user)
    await db.flush()
    db.add(
        PasswordCredential(
            user_id=user.id,
            password_hash=hash_password(registration.password),
        )
    )
    await db.commit()
    await db.refresh(user)
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
async def login_with_password(
    login: PasswordLogin,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    result = await db.execute(
        select(User, PasswordCredential)
        .join(PasswordCredential, PasswordCredential.user_id == User.id)
        .where(User.email == login.email)
    )
    row = result.one_or_none()
    if row is not None:
        user, credential = row
        if verify_password(login.password, credential.password_hash):
            return _auth_response(user)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email address or password.",
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    _require_google_configuration()
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        error = quote(exc.description or "Google authentication failed.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    profile = token.get("userinfo") or {}
    google_sub = str(profile.get("sub", ""))
    email = str(profile.get("email", "")).strip().lower()
    full_name = " ".join(str(profile.get("name", "")).split())
    email_verified = profile.get("email_verified") is True

    if not google_sub or not email or not full_name or not email_verified:
        error = quote("Google did not return a verified name and email address.")
        return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")

    user = await db.scalar(select(User).where(User.google_sub == google_sub))
    if user is None:
        email_owner = await db.scalar(select(User).where(User.email == email))
        if email_owner is not None:
            error = quote(
                "An account with this email already exists. Use its existing sign-in method."
            )
            return RedirectResponse(f"{FRONTEND_URL}/auth/callback#error={error}")
        user = User(
            google_sub=google_sub,
            full_name=full_name,
            email=email,
            avatar_url=profile.get("picture"),
        )
        db.add(user)
    else:
        user.google_sub = google_sub
        user.full_name = full_name
        user.email = email
        user.avatar_url = profile.get("picture")

    await db.commit()
    await db.refresh(user)
    app_token = quote(create_access_token(user.id))
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback#token={app_token}")


@router.get("/me", response_model=UserResponse)
async def read_current_user(user: User = Depends(get_current_user)):  # noqa: B008
    return user


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    await db.execute(
        delete(PasswordCredential).where(PasswordCredential.user_id == user.id)
    )
    await db.delete(user)
    await db.commit()
