import { spawn } from 'node:child_process'

export type SystemCopyCommand = {
  command: string
  args: string[]
}

export type RunCommand = (command: string, args: string[]) => Promise<void>

export const getSystemCopyCommand = (platform: NodeJS.Platform): SystemCopyCommand => {
  switch (platform) {
    case 'darwin':
      return {
        command: 'osascript',
        args: [
          '-e',
          'tell application "System Events" to keystroke "c" using {command down}',
        ],
      }
    case 'win32':
      return {
        command: 'powershell',
        args: [
          '-NoProfile',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")',
        ],
      }
    default:
      return {
        command: 'xdotool',
        args: ['key', '--clearmodifiers', 'ctrl+c'],
      }
  }
}

const defaultRunCommand: RunCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `System copy command failed (${command}): ${code ?? 'null'}${
            signal ? `/${signal}` : ''
          }`
        )
      )
    })
  })

export const createSystemCopyShortcut = (deps: {
  platform: NodeJS.Platform
  runCommand?: RunCommand
}) => {
  const runCommand = deps.runCommand ?? defaultRunCommand
  return async () => {
    const { command, args } = getSystemCopyCommand(deps.platform)
    await runCommand(command, args)
  }
}
