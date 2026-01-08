export type ClipboardLike = {
  readText: () => string
  writeText: (text: string) => void
}

export type CaptureSelectionOptions = {
  clipboard: ClipboardLike
  sendCopyShortcut: () => Promise<void>
  settleDelayMs?: number
}

export type CaptureSelectionResult = {
  text: string
  previousText: string
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export const captureSelection = async (
  options: CaptureSelectionOptions
): Promise<CaptureSelectionResult> => {
  const { clipboard, sendCopyShortcut, settleDelayMs = 0 } = options
  const previousText = clipboard.readText()

  try {
    await sendCopyShortcut()
    if (settleDelayMs > 0) {
      await wait(settleDelayMs)
    }
    const text = clipboard.readText()
    return { text, previousText }
  } finally {
    clipboard.writeText(previousText)
  }
}
