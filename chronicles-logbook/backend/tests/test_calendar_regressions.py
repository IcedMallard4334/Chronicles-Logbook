from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import httpx
import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.models import GoogleCalendarAccount, GoogleCalendarToken
from app.routers import auth, calendar
from app.security import (
    create_access_token,
    create_calendar_state,
    decode_access_token,
    decode_calendar_state,
)


def test_state_rejects_access_tokens_expiry_and_tampering():
    user_id = uuid4()
    state = create_calendar_state(user_id)
    assert decode_calendar_state(state) == user_id
    assert decode_calendar_state(state + 'x') is None
    assert decode_calendar_state(create_access_token(user_id)) is None
    with pytest.raises(HTTPException):
        decode_access_token(state)
    expired = jwt.encode({'sub': str(user_id), 'aud': 'google-calendar', 'jti': 'test',
                          'iat': datetime.now(timezone.utc)-timedelta(minutes=20),
                          'exp': datetime.now(timezone.utc)-timedelta(minutes=10)},
                         JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    assert decode_calendar_state(expired) is None


async def start_connection(client):
    response = await client.get('/calendar/google/auth')
    assert response.status_code == 200
    params = parse_qs(urlparse(response.json()['authorization_url']).query)
    assert params['scope'] == ['https://www.googleapis.com/auth/calendar.readonly']
    return params['state'][0]


def mock_exchange(monkeypatch, *, fail=False, scope=True):
    class GoogleClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            if fail:
                raise httpx.ConnectError('simulated network failure')
            return httpx.Response(200, json={
                'refresh_token': 'test-refresh-token',
                'access_token': 'mock-access',
                'scope': calendar._SCOPES if scope else 'openid',
            })
        async def get(self, *args, **kwargs):
            return httpx.Response(200, json={'id': 'calendar@example.com'})
    monkeypatch.setattr(auth.httpx, 'AsyncClient', GoogleClient)


async def test_calendar_callback_stores_token(authenticated_client, test_user, db_session, monkeypatch):
    state = await start_connection(authenticated_client)
    mock_exchange(monkeypatch)
    response = await authenticated_client.get('/auth/google/calendar/callback', params={'code':'test','state':state})
    assert 'calendar_connected=true' in response.headers['location']
    token = await db_session.scalar(select(GoogleCalendarAccount).where(GoogleCalendarAccount.user_id == test_user.id))
    assert token.refresh_token == 'test-refresh-token'
    assert token.created_at is not None


async def test_cancelled_consent_returns_to_app(authenticated_client):
    state = await start_connection(authenticated_client)
    response = await authenticated_client.get('/auth/google/calendar/callback', params={'error':'access_denied','state':state})
    assert response.status_code == 307
    assert 'cancelled' in response.headers['location']


@pytest.mark.parametrize('failure', ['network','scope'])
async def test_failed_exchange_does_not_connect(authenticated_client, test_user, db_session, monkeypatch, failure):
    state = await start_connection(authenticated_client)
    mock_exchange(monkeypatch, fail=failure=='network', scope=failure!='scope')
    response = await authenticated_client.get('/auth/google/calendar/callback', params={'code':'test','state':state})
    assert 'calendar_error=' in response.headers['location']
    assert await db_session.get(GoogleCalendarToken, test_user.id) is None


async def test_events_refresh_and_paginate(authenticated_client, test_user, db_session, monkeypatch):
    db_session.add(GoogleCalendarToken(user_id=test_user.id,refresh_token='test-refresh'))
    await db_session.commit()
    credentials=MagicMock(valid=False, expired=False)
    monkeypatch.setattr(calendar, '_credentials_from_token', lambda token: credentials)
    service=MagicMock()
    service.events.return_value.list.return_value.execute.side_effect=[
        {'items':[{'id':'a','start':{'date':'2026-08-01'},'end':{'date':'2026-08-02'}}],'nextPageToken':'next'},
        {'items':[{'id':'b','start':{'dateTime':'2026-08-02T12:00:00Z'},'end':{'dateTime':'2026-08-02T13:00:00Z'}}]},
    ]
    monkeypatch.setattr(calendar,'build',lambda *args,**kwargs:service)
    response=await authenticated_client.get('/calendar/google/events',params={'start':'2026-08-01T00:00:00Z','end':'2026-09-01T00:00:00Z'})
    assert response.status_code == 200
    assert [event['id'] for event in response.json()] == ['a','b']
    credentials.refresh.assert_called_once()
    service.close.assert_called_once()


async def test_calendar_requires_login(async_client):
    response=await async_client.get('/calendar/google/auth')
    assert response.status_code == 401
