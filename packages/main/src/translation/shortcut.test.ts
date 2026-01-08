import { describe, expect, it, vi } from 'vitest'
import { registerTranslationShortcut } from './shortcut'

describe('registerTranslationShortcut', () => {
  it('registers and unregisters the shortcut', () => {
    const register = vi.fn().mockReturnValue(true)
    const unregister = vi.fn()
    const onTriggered = vi.fn()

    const dispose = registerTranslationShortcut({
      globalShortcut: { register, unregister },
      accelerator: 'Control+Shift+T',
      onTriggered,
    })

    expect(register).toHaveBeenCalledWith('Control+Shift+T', onTriggered)

    dispose()

    expect(unregister).toHaveBeenCalledWith('Control+Shift+T')
  })

  it('throws when registration fails', () => {
    const register = vi.fn().mockReturnValue(false)
    const unregister = vi.fn()

    expect(() =>
      registerTranslationShortcut({
        globalShortcut: { register, unregister },
        accelerator: 'Control+Shift+T',
        onTriggered: vi.fn(),
      })
    ).toThrow(/failed to register/i)
  })
})
