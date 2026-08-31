import { beforeEach, expect, it, vi } from 'vitest'
import { fetchProjects } from './api'

const reply = (status, body) => ({ ok: status === 200, status, json: async () => body })
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('chronicles_token', 'expired')
  vi.stubGlobal('fetch', vi.fn())
})

it('renews an expired login and retries with the fresh access token', async () => {
  fetch.mockResolvedValueOnce(reply(401, { detail: 'Invalid or expired session.' }))
    .mockResolvedValueOnce(reply(200, { access_token: 'fresh', user: { full_name: 'Test' } }))
    .mockResolvedValueOnce(reply(200, []))
  expect(await fetchProjects()).toEqual([])
  expect(fetch.mock.calls[1][1].credentials).toBe('include')
  expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh')
})

it('clears unrecoverable sessions and notifies the app', async () => {
  const ended = vi.fn()
  window.addEventListener('chronicles-session-ended', ended)
  fetch.mockResolvedValueOnce(reply(401, { detail: 'Invalid or expired session.' }))
    .mockResolvedValueOnce(reply(401, {}))
  await expect(fetchProjects()).rejects.toThrow('Please sign in again')
  expect(localStorage.getItem('chronicles_token')).toBeNull()
  expect(ended).toHaveBeenCalledTimes(1)
  window.removeEventListener('chronicles-session-ended', ended)
})

it('does not erase the login for Google authorization errors', async () => {
  fetch.mockResolvedValueOnce(reply(401, { detail: 'Google Calendar access expired. Reconnect.' }))
  await expect(fetchProjects()).rejects.toThrow('Google Calendar')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('chronicles_token')).toBe('expired')
})
