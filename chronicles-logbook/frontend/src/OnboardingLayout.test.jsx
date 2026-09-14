import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OnboardingLayout from './OnboardingLayout'
import SetupPage from './SetupPage'
import MiraConsentPage from './MiraConsentPage'

vi.mock('./AuthPage', () => ({ AuthIntro: () => <aside data-testid="intro">Chronicles</aside> }))
vi.mock('./api', () => ({ fetchMiraConsent: vi.fn(), saveMiraConsent: vi.fn() }))

it.each(['Save and continue →', 'Skip for now'])('keeps the onboarding shell mounted through %s', (label) => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  render(<MemoryRouter initialEntries={['/setup']}><Routes>
    <Route element={<OnboardingLayout />}>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/mira-permissions" element={<MiraConsentPage />} />
    </Route>
  </Routes></MemoryRouter>)
  const intro = screen.getByTestId('intro')
  const panel = screen.getByRole('heading', { name: 'Make it yours' }).closest('.setup-panel')
  panel.scrollTop = 400
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(screen.getByRole('heading', { name: 'Your work. Your permission.' })).toBeInTheDocument()
  expect(screen.getByTestId('intro')).toBe(intro)
  expect(panel.scrollTop).toBe(0)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
