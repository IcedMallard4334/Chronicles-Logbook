import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MiraConsentPage, { MiraConsentGate } from './MiraConsentPage'
import { fetchMiraConsent, saveMiraConsent } from './api'
vi.mock('./api', () => ({ fetchMiraConsent: vi.fn(), saveMiraConsent: vi.fn() }))
vi.mock('./AuthPage', () => ({ AuthIntro: () => <aside>Chronicles</aside> }))
beforeEach(() => { vi.resetAllMocks(); window.localStorage.clear() })
function page() {
  render(<MemoryRouter initialEntries={['/mira-permissions']}><Routes><Route path='/mira-permissions' element={<MiraConsentPage />} /><Route path='/app' element={<p>Workspace ready</p>} /></Routes></MemoryRouter>)
}
it.each([[true, /Accept ·/], [false, /Decline ·/]])('saves explicit choice %s before continuing', async (accepted, label) => {
  saveMiraConsent.mockResolvedValue({ accepted })
  page()
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(await screen.findByText('Workspace ready')).toBeInTheDocument()
  expect(saveMiraConsent).toHaveBeenCalledWith(accepted)
})
it('stays on the notice if saving fails', async () => {
  saveMiraConsent.mockRejectedValue(new Error('offline'))
  page()
  fireEvent.click(screen.getByRole('button', { name: /Decline ·/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
  expect(screen.queryByText('Workspace ready')).not.toBeInTheDocument()
})
it('routes undecided accounts to the notice', async () => {
  fetchMiraConsent.mockResolvedValue({ decided: false })
  render(<MemoryRouter initialEntries={['/app']}><Routes><Route path='/app' element={<MiraConsentGate><p>Private workspace</p></MiraConsentGate>} /><Route path='/mira-permissions' element={<p>Review permission</p>} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Review permission')).toBeInTheDocument()
  expect(screen.queryByText('Private workspace')).not.toBeInTheDocument()
})

it("has a Back button, styled like the other footer buttons, that returns to the preferences", async () => {
  const { container } = render(<MemoryRouter initialEntries={['/mira-permissions']}><Routes><Route path='/mira-permissions' element={<MiraConsentPage />} /><Route path='/setup' element={<p>Preferences step</p>} /></Routes></MemoryRouter>)

  const back = screen.getByRole("button", { name: /Back/ })
  expect(back).toHaveClass("btn-secondary", "setup-back")
  expect(container.querySelector(".setup-footer")).toContainElement(back)

  fireEvent.click(back)

  expect(await screen.findByText("Preferences step")).toBeInTheDocument()
})
