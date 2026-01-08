export type ShortcutDeps = {
  globalShortcut: {
    register: (accelerator: string, callback: () => void) => boolean
    unregister: (accelerator: string) => void
  }
  accelerator: string
  onTriggered: () => void
}

export const registerTranslationShortcut = (deps: ShortcutDeps) => {
  const { globalShortcut, accelerator, onTriggered } = deps
  const registered = globalShortcut.register(accelerator, onTriggered)

  if (!registered) {
    throw new Error(`Failed to register shortcut: ${accelerator}`)
  }

  return () => {
    globalShortcut.unregister(accelerator)
  }
}
