import { describe, expect, it, vi } from 'vitest'
import { createTranslationController } from './translationController'

describe('translationController', () => {
  it('captures selection and invokes translation', async () => {
    const captureSelection = vi.fn().mockResolvedValue({ text: 'hello' })
    const buildRequest = vi.fn().mockReturnValue({
      sourceText: 'hello',
      targetLanguage: 'es',
    })
    const record = {
      id: 'record-1',
      createdAt: '2026-01-07T00:00:00.000Z',
      sourceText: 'hello',
      translatedText: 'hola',
      targetLanguage: 'es',
      status: 'success',
    }
    const translate = vi.fn().mockResolvedValue(record)
    const onResult = vi.fn()

    const controller = createTranslationController({
      captureSelection,
      buildRequest,
      translate,
      onResult,
    })

    const result = await controller.handleShortcut()

    expect(buildRequest).toHaveBeenCalledWith('hello')
    expect(translate).toHaveBeenCalledWith({
      sourceText: 'hello',
      targetLanguage: 'es',
    })
    expect(onResult).toHaveBeenCalledWith(record, {
      sourceText: 'hello',
      targetLanguage: 'es',
    })
    expect(result).toEqual({
      record,
      request: {
        sourceText: 'hello',
        targetLanguage: 'es',
      },
    })
  })

  it('does nothing when no text is selected', async () => {
    const captureSelection = vi.fn().mockResolvedValue({ text: '   ' })
    const buildRequest = vi.fn()
    const translate = vi.fn()

    const controller = createTranslationController({
      captureSelection,
      buildRequest,
      translate,
    })

    await controller.handleShortcut()

    expect(buildRequest).not.toHaveBeenCalled()
    expect(translate).not.toHaveBeenCalled()
  })
})
