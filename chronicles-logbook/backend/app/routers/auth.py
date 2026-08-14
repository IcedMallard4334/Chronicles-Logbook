from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, SignInRequest, SignUpRequest
from app.security import create_access_token, hash_password, verify_user_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(access_token=create_access_token(user.id), user=user)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def sign_up(
    data: SignUpRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AuthResponse:
    existing = await db.scalar(select(User).where(User.email == str(data.email)))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=data.full_name,
        email=str(data.email),
        password_hash=hash_password(data.password),
    )
    db.add(user)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from None

    await db.refresh(user)
    return _auth_response(user)


@router.post("/signin", response_model=AuthResponse)
async def sign_in(
    data: SignInRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AuthResponse:
    user = await db.scalar(select(User).where(User.email == str(data.email)))
    encoded_hash = user.password_hash if user else None
    if not verify_user_password(data.password, encoded_hash) or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _auth_response(user)
