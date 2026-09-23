from app.models import GoogleCalendarAccount


async def test_multiple_accounts_and_scoped_disconnect(authenticated_client, second_authenticated_client, test_user, db_session):
    first=GoogleCalendarAccount(user_id=test_user.id,calendar_id='one@example.com',label='One',refresh_token='secret-one')
    second=GoogleCalendarAccount(user_id=test_user.id,calendar_id='two@example.com',label='Two',refresh_token='secret-two')
    db_session.add_all([first,second])
    await db_session.commit()
    status=await authenticated_client.get('/calendar/google/status')
    assert len(status.json()['accounts'])==2
    assert 'refresh_token' not in status.text
    other=await second_authenticated_client.get('/calendar/google/status')
    assert other.json()['accounts']==[]
    response=await second_authenticated_client.get('/calendar/google/events',params={'account_id':str(first.id),'start':'2026-08-01T00:00:00Z','end':'2026-09-01T00:00:00Z'})
    assert response.status_code==403
    await second_authenticated_client.delete('/calendar/google/disconnect',params={'account_id':str(first.id)})
    assert await db_session.get(GoogleCalendarAccount,first.id) is not None
    await authenticated_client.delete('/calendar/google/disconnect',params={'account_id':str(first.id)})
    remaining=(await authenticated_client.get('/calendar/google/status')).json()['accounts']
    assert [account['label'] for account in remaining]==['Two']


async def test_activity_roundtrip_and_ownership(authenticated_client,second_authenticated_client):
    payload={'title':'Planning','day':'2026-08-31','start_time':'09:00','end_time':'10:00','description':'Notes'}
    response=await authenticated_client.post('/calendar/activities',json=payload)
    assert response.status_code==201
    identifier=response.json()['id']
    params={'start':'2026-08-01','end':'2026-09-01'}
    assert (await authenticated_client.get('/calendar/activities',params=params)).json()[0]['title']=='Planning'
    assert (await second_authenticated_client.get('/calendar/activities',params=params)).json()==[]
    assert (await second_authenticated_client.delete('/calendar/activities/'+identifier)).status_code==404
    assert (await authenticated_client.delete('/calendar/activities/'+identifier)).status_code==204
    assert (await authenticated_client.get('/calendar/activities',params=params)).json()==[]


async def test_activity_validation(authenticated_client):
    for changes in [{'title':' '},{'end_time':'08:00'},{'start_time':'25:00'}]:
        payload={'title':'Planning','day':'2026-08-31','start_time':'09:00','end_time':'10:00',**changes}
        assert (await authenticated_client.post('/calendar/activities',json=payload)).status_code==422
    response=await authenticated_client.post('/calendar/activities',json={'title':'Day off','day':'2026-08-31','all_day':True})
    assert response.status_code==201
    assert response.json()['start_time'] is None


async def test_activity_requires_auth(async_client):
    assert (await async_client.post('/calendar/activities',json={'title':'Day off','day':'2026-08-31','all_day':True})).status_code==401
