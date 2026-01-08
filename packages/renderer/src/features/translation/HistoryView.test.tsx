import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryView } from './HistoryView'

let activeRoot: ReturnType<typeof createRoot> | null = null
let activeContainer: HTMLDivElement | null = null

const renderView = () => {
  activeContainer = document.createElement('div')
  document.body.appendChild(activeContainer)
  activeRoot = createRoot(activeContainer)
  act(() => {
    activeRoot?.render(<HistoryView />)
  })
}

const flushPromises = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('HistoryView', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (activeRoot) {
      act(() => {
        activeRoot?.unmount()
      })
    }
    activeRoot = null
    if (activeContainer) {
      activeContainer.remove()
    }
    activeContainer = null
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = ''
  })

  it('renders history list and selection', async () => {
    window.translationApi = {
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'record-2',
          createdAt: '2026-01-07T00:00:02.000Z',
          sourceText: 'second',
          translatedText: 'second-translation',
          targetLanguage: 'es',
          status: 'success',
        },
        {
          id: 'record-1',
          createdAt: '2026-01-07T00:00:01.000Z',
          sourceText: 'first',
          translatedText: 'first-translation',
          targetLanguage: 'es',
          status: 'success',
        },
      ]),
    } as unknown as typeof window.translationApi

    renderView()

    await act(async () => {
      await flushPromises()
    })

    const firstItem = document.querySelector('[data-testid="history-item-record-2"]')
    const secondItem = document.querySelector('[data-testid="history-item-record-1"]')

    expect(firstItem).toBeTruthy()
    expect(secondItem).toBeTruthy()

    await act(async () => {
      ;(secondItem as HTMLButtonElement).click()
    })

    const detailSource = document.querySelector('[data-testid="history-detail-source"]')
    const detailTranslation = document.querySelector('[data-testid="history-detail-translation"]')

    expect(detailSource?.textContent).toContain('first')
    expect(detailTranslation?.textContent).toContain('first-translation')
  })

  it('renders newest entries first', async () => {
    window.translationApi = {
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'record-new',
          createdAt: '2026-01-07T00:00:02.000Z',
          sourceText: 'newest',
          translatedText: 'newest-translation',
          targetLanguage: 'es',
          status: 'success',
        },
        {
          id: 'record-old',
          createdAt: '2026-01-07T00:00:01.000Z',
          sourceText: 'oldest',
          translatedText: 'oldest-translation',
          targetLanguage: 'es',
          status: 'success',
        },
      ]),
    } as unknown as typeof window.translationApi

    renderView()

    await act(async () => {
      await flushPromises()
    })

    const items = Array.from(
      document.querySelectorAll('[data-testid^="history-item-"]')
    )
    expect(items[0]?.getAttribute('data-testid')).toBe('history-item-record-new')
    expect(items[1]?.getAttribute('data-testid')).toBe('history-item-record-old')
  })
})
