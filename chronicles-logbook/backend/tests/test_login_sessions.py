import hashlib
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.responses import Response

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.models import LoginSession
from app.routers.auth import _create_login_session
from app.security import decode_access_token


@pytest.mark.asyncio
async def test_session_survives_access_expiry_and_logout_revokes(async_client, db_session, test_user):
    response = Response()
    await _create_login_session(test_user, db_session, response)
    cookie = response.headers['set-cookie']
    assert 'HttpOnly' in cookie and 'Max-Age=2592000' in cookie
    token = cookie.split(';')[0].split('=', 1)[1]
    async_client.cookies.set('chronicles_refresh', token, path='/auth')
    headers = {'Origin': 'http://frontend.test'}
    expired_access = jwt.encode({'sub': str(test_user.id),
                                 'iat': datetime.now(timezone.utc) - timedelta(hours=2),
                                 'exp': datetime.now(timezone.utc) - timedelta(hours=1)},
                                JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    assert (await async_client.get('/auth/me', headers={'Authorization': f'Bearer {expired_access}'})).status_code == 401
    result = await async_client.post('/auth/refresh', headers=headers)
    assert result.status_code == 200
    assert decode_access_token(result.json()['access_token']) == test_user.id
    assert result.headers['cache-control'] == 'no-store'
    assert await db_session.get(LoginSession, token) is None
    assert (await async_client.post('/auth/logout', headers=headers)).status_code == 204
    async_client.cookies.set('chronicles_refresh', token, path='/auth')
    assert (await async_client.post('/auth/refresh', headers=headers)).status_code == 401


@pytest.mark.asyncio
async def test_expired_missing_and_foreign_origin_sessions_rejected(async_client, db_session, test_user):
    headers = {'Origin': 'http://frontend.test'}
    assert (await async_client.post('/auth/refresh', headers=headers)).status_code == 401
    db_session.add(LoginSession(token_hash=hashlib.sha256(b'expired').hexdigest(), user_id=test_user.id,
                                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    await db_session.commit()
    async_client.cookies.set('chronicles_refresh', 'expired', path='/auth')
    assert (await async_client.post('/auth/refresh', headers=headers)).status_code == 401
    assert (await async_client.post('/auth/refresh', headers={'Origin': 'https://attacker.test'})).status_code == 403
    assert (await async_client.post('/auth/logout', headers={'Origin': 'https://attacker.test'})).status_code == 403
