from unittest.mock import Mock

from app.models import MiraConsent
from app.routers import ai
from app.services.gemini_service import GeminiResponse


async def test_consent_requires_authentication(async_client):
    assert (await async_client.get('/ai/consent')).status_code == 401
    assert (await async_client.put('/ai/consent', json={'accepted': True})).status_code == 401


async def test_undecided_and_declined_never_call_provider(authenticated_client, monkeypatch):
    provider = Mock(side_effect=AssertionError('Must not call Gemini'))
    monkeypatch.setattr(ai, 'generate_response', provider)
    assert (await authenticated_client.get('/ai/consent')).json()['decided'] is False
    for decline in [False, True]:
        if decline:
            assert (await authenticated_client.put('/ai/consent', json={'accepted': False})).status_code == 200
        response = await authenticated_client.post('/ai/chat', json={'message': 'Create a project with my private data'})
        assert response.status_code == 200
        assert 'limited mode' in response.json()['reply']
        assert 'action' not in response.json()
    provider.assert_not_called()


async def test_accept_revoke_and_account_isolation(authenticated_client, second_authenticated_client, monkeypatch):
    provider = Mock(return_value=GeminiResponse(reply='Ready'))
    monkeypatch.setattr(ai, 'generate_response', provider)
    await authenticated_client.put('/ai/consent', json={'accepted': True})
    assert (await authenticated_client.get('/ai/consent')).json()['accepted'] is True
    assert (await second_authenticated_client.get('/ai/consent')).json()['accepted'] is False
    assert (await authenticated_client.post('/ai/chat', json={'message': 'Hello'})).json()['reply'] == 'Ready'
    await authenticated_client.put('/ai/consent', json={'accepted': False})
    await authenticated_client.post('/ai/chat', json={'message': 'Hello again'})
    provider.assert_called_once_with('Hello')


async def test_consent_rejects_coerced_and_extra_fields(authenticated_client):
    for payload in [{'accepted': 'true'}, {'accepted': True, 'user_id': 'someone-else'}]:
        assert (await authenticated_client.put('/ai/consent', json=payload)).status_code == 422


async def test_old_notice_requires_new_choice(authenticated_client, db_session, test_user, monkeypatch):
    db_session.add(MiraConsent(user_id=test_user.id, accepted=True, version='old-notice'))
    await db_session.commit()
    provider = Mock(side_effect=AssertionError('Old consent must not enable Gemini'))
    monkeypatch.setattr(ai, 'generate_response', provider)
    assert (await authenticated_client.get('/ai/consent')).json()['decided'] is False
    response = await authenticated_client.post('/ai/chat', json={'message': 'Hello'})
    assert 'limited mode' in response.json()['reply']
    provider.assert_not_called()
