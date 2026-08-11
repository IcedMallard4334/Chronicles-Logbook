import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import App from './App'

describe('App', () => {
  it('renders the hero heading', () => {
    const html = renderToString(<App />)
    expect(html).toContain('Get started')
  })

  it('renders the counter with initial count of 0', () => {
    const html = renderToString(<App />)
    expect(html).toMatch(/Count is[\s\S]*?0/)
  })
})
