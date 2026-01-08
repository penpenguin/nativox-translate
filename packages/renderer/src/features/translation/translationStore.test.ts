import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translationStore } from './translationStore'

const createShortcutListenerHarness = () => {
  const listeners: Array<(payload: unknown) => void> = []
  const onShortcutResult = vi.fn().mockImplementation((listener) => {
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    }
  })

  window.translationApi = {
    onShortcutResult,
  } as unknown as typeof window.translationApi

  return { listeners, onShortcutResult }
}

describe('translationStore shortcut results', () => {
  beforeEach(() => {
    translationStore.stopListening()
    translationStore.reset()
    window.translationApi = undefined
  })

  it('stores the request payload so retry can use shortcut input', () => {
    const { listeners } = createShortcutListenerHarness()
    translationStore.startListening()

    const request = {
      sourceText: 'hello',
      targetLanguage: 'es',
      systemPrompt: 'system',
      customPrompt: 'custom',
      backTranslate: true,
    }

    listeners[0]?.({
      status: 'error',
      error: { title: 'Translation failed', cause: 'Agent failed' },
      request,
    })

    expect(translationStore.getState().lastRequest).toEqual(request)
  })
})
