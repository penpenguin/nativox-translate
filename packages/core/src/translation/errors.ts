import type { TranslationErrorInfo } from '@shared/translation/types'

const getMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

export const isTimeoutError = (error: unknown) =>
  /timeout/i.test(getMessage(error))

export const isCommandNotFoundError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('enoent') || message.includes('not found')
}

export const mapTranslationError = (error: unknown): TranslationErrorInfo => {
  const message = getMessage(error)

  if (isTimeoutError(error)) {
    return {
      title: 'Translation timed out',
      cause: message,
    }
  }

  if (isCommandNotFoundError(error)) {
    return {
      title: 'Agent command not found',
      cause: message,
    }
  }

  return {
    title: 'Translation failed',
    cause: message,
  }
}
