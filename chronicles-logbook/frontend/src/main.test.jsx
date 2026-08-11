/* global document */

import { describe, it, expect, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

vi.mock('react-dom/client')

describe('main', () => {
  it('renders App into the root element', async () => {
    const renderMock = vi.fn()
    vi.mocked(createRoot).mockReturnValue({ render: renderMock })

    const rootElement = { id: 'root' }
    vi.stubGlobal('document', {
      getElementById: vi.fn(() => rootElement),
    })

    await import('./main')

    expect(document.getElementById).toHaveBeenCalledWith('root')
    expect(createRoot).toHaveBeenCalledWith(rootElement)
    expect(renderMock).toHaveBeenCalled()
  })
})
