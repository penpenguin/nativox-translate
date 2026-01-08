import { describe, expect, it, vi } from 'vitest'
import { createSystemCopyShortcut, getSystemCopyCommand } from './systemCopy'

describe('getSystemCopyCommand', () => {
  it('uses osascript on macOS', () => {
    expect(getSystemCopyCommand('darwin')).toEqual({
      command: 'osascript',
      args: [
        '-e',
        'tell application "System Events" to keystroke "c" using {command down}',
      ],
    })
  })

  it('uses powershell on Windows', () => {
    expect(getSystemCopyCommand('win32')).toEqual({
      command: 'powershell',
      args: [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")',
      ],
    })
  })

  it('uses xdotool on Linux', () => {
    expect(getSystemCopyCommand('linux')).toEqual({
      command: 'xdotool',
      args: ['key', '--clearmodifiers', 'ctrl+c'],
    })
  })
})

describe('createSystemCopyShortcut', () => {
  it('invokes the platform command runner', async () => {
    const runCommand = vi.fn().mockResolvedValue(undefined)
    const sendCopyShortcut = createSystemCopyShortcut({
      platform: 'linux',
      runCommand,
    })

    await sendCopyShortcut()

    expect(runCommand).toHaveBeenCalledWith('xdotool', [
      'key',
      '--clearmodifiers',
      'ctrl+c',
    ])
  })
})
