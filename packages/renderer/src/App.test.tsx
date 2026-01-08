import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { translationStore } from './features/translation/translationStore'

let activeRoot: ReturnType<typeof createRoot> | null = null
let activeContainer: HTMLDivElement | null = null

const renderApp = () => {
  activeContainer = document.createElement('div')
  document.body.appendChild(activeContainer)
  activeRoot = createRoot(activeContainer)
  act(() => {
    activeRoot?.render(<App />)
  })
}

const flushPromises = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('App', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    translationStore.reset()
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

  it('renders translation, settings, and history sections', async () => {
    window.translationApi = {
      getPromptSettings: vi.fn().mockResolvedValue({
        systemPrompt: 'system',
        customPrompt: 'custom',
        targetLanguage: 'en',
        backTranslate: false,
        agentTimeoutMs: 60000,
        updatedAt: '2026-01-07T00:00:00.000Z',
      }),
      listAgentConfigs: vi.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          displayName: 'Agent One',
          command: 'agent-cli',
          isDefault: true,
          updatedAt: '2026-01-07T00:00:00.000Z',
        },
      ]),
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'record-1',
          createdAt: '2026-01-07T00:00:01.000Z',
          sourceText: 'hello',
          translatedText: 'hola',
          targetLanguage: 'es',
          status: 'success',
        },
      ]),
    } as unknown as typeof window.translationApi

    renderApp()

    await act(async () => {
      await flushPromises()
    })

    expect(document.body.textContent).toContain('Translation')
    expect(document.body.querySelector('[data-testid="settings-help"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid^="history-item-"]')).toBeTruthy()
  })

  it('surfaces shortcut errors in the translation view', async () => {
    let shortcutListener:
      | ((payload: { status: 'error'; error: { title: string; cause: string } }) => void)
      | null = null

    window.translationApi = {
      getPromptSettings: vi.fn().mockResolvedValue({
        systemPrompt: 'system',
        customPrompt: 'custom',
        targetLanguage: 'en',
        backTranslate: false,
        agentTimeoutMs: 60000,
        updatedAt: '2026-01-07T00:00:00.000Z',
      }),
      listAgentConfigs: vi.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          displayName: 'Agent One',
          command: 'agent-cli',
          isDefault: true,
          updatedAt: '2026-01-07T00:00:00.000Z',
        },
      ]),
      listHistory: vi.fn().mockResolvedValue([]),
      onShortcutResult: (listener) => {
        shortcutListener = listener as typeof shortcutListener
        return () => {
          shortcutListener = null
        }
      },
    } as unknown as typeof window.translationApi

    renderApp()

    await act(async () => {
      await flushPromises()
    })

    await act(async () => {
      shortcutListener?.({
        status: 'error',
        error: {
          title: 'Translation failed',
          cause: 'Agent command is not configured',
        },
      })
    })

    const banner = document.querySelector('[data-testid="error-banner"]')
    expect(banner).toBeTruthy()
    expect(document.body.textContent).toContain('Agent command is not configured')
  })
})
