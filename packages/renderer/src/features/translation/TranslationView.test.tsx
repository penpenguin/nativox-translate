import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslationView } from './TranslationView'
import { translationStore } from './translationStore'

const setupClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

let activeRoot: ReturnType<typeof createRoot> | null = null
let activeContainer: HTMLDivElement | null = null

const renderView = () => {
  activeContainer = document.createElement('div')
  document.body.appendChild(activeContainer)
  activeRoot = createRoot(activeContainer)
  act(() => {
    activeRoot?.render(<TranslationView />)
  })
  return { container: activeContainer, root: activeRoot }
}

describe('TranslationView', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    translationStore.reset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('renders source/translated text and copy actions with timing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-07T00:00:00.000Z'))

    const writeText = setupClipboard()
    const record = {
      id: 'record-1',
      createdAt: '2026-01-07T00:00:00.000Z',
      sourceText: 'hello',
      translatedText: 'hola',
      targetLanguage: 'es',
      status: 'success',
    }

    window.translationApi = {
      translate: vi.fn().mockResolvedValue(record),
    } as unknown as typeof window.translationApi

    await act(async () => {
      await translationStore.translate({
        sourceText: 'hello',
        targetLanguage: 'es',
      })
    })

    renderView()

    expect(document.body.textContent).toContain('hello')
    expect(document.body.textContent).toContain('hola')

    const copySource = document.querySelector('[data-testid="copy-source"]')
    const copyTranslated = document.querySelector(
      '[data-testid="copy-translation"]'
    )

    expect(copySource).toBeTruthy()
    expect(copyTranslated).toBeTruthy()

    vi.setSystemTime(new Date('2026-01-07T00:00:05.000Z'))

    await act(async () => {
      ;(copySource as HTMLButtonElement).click()
    })

    expect(writeText).toHaveBeenCalledWith('hello')
    expect(translationStore.getState().lastCopyDurationMs).toBe(5000)
  })

  it('shows an error banner with retry action', async () => {
    const translateMock = vi
      .fn()
      .mockRejectedValue(new Error('Agent failed'))

    window.translationApi = {
      translate: translateMock,
    } as unknown as typeof window.translationApi

    await act(async () => {
      await translationStore.translate({
        sourceText: 'hello',
        targetLanguage: 'es',
      })
    })

    renderView()

    const banner = document.querySelector('[data-testid="error-banner"]')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('Translation failed')
    expect(banner?.textContent).toContain('Agent failed')

    const retryButton = document.querySelector('[data-testid="retry-translation"]')
    expect(retryButton).toBeTruthy()

    await act(async () => {
      ;(retryButton as HTMLButtonElement).click()
    })

    expect(translateMock).toHaveBeenCalledTimes(2)
  })

  it('clears the previous record when a new translation fails', async () => {
    const record = {
      id: 'record-1',
      createdAt: '2026-01-07T00:00:00.000Z',
      sourceText: 'hello',
      translatedText: 'hola',
      targetLanguage: 'es',
      status: 'success',
    }

    const translateMock = vi
      .fn()
      .mockResolvedValueOnce(record)
      .mockRejectedValueOnce(new Error('Agent failed'))

    window.translationApi = {
      translate: translateMock,
    } as unknown as typeof window.translationApi

    renderView()

    await act(async () => {
      await translationStore.translate({
        sourceText: 'hello',
        targetLanguage: 'es',
      })
    })

    expect(document.body.textContent).toContain('hola')

    await act(async () => {
      await translationStore.translate({
        sourceText: 'hello',
        targetLanguage: 'es',
      })
    })

    const banner = document.querySelector('[data-testid="error-banner"]')
    expect(banner).toBeTruthy()
    expect(document.body.textContent).not.toContain('hola')
  })
})
