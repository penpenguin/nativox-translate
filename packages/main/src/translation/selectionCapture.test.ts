import { describe, expect, it } from 'vitest'
import { captureSelection } from './selectionCapture'

describe('captureSelection', () => {
  it('captures selection and restores clipboard', async () => {
    const clipboard = {
      text: 'previous',
      readText() {
        return this.text
      },
      writeText(value: string) {
        this.text = value
      },
    }
    const sendCopyShortcut = async () => {
      clipboard.writeText('selected')
    }

    const result = await captureSelection({ clipboard, sendCopyShortcut })

    expect(result.text).toBe('selected')
    expect(clipboard.text).toBe('previous')
  })
})
