import type {
  TranslateRequestPayload,
  TranslateResponsePayload,
} from '@shared/translation/ipc'

export type ShortcutTranslationResult = {
  request: TranslateRequestPayload
  record: TranslateResponsePayload
}

export type TranslationControllerDeps = {
  captureSelection: () => Promise<{ text: string }>
  buildRequest: (sourceText: string) => TranslateRequestPayload
  translate: (payload: TranslateRequestPayload) => Promise<TranslateResponsePayload>
  onResult?: (record: TranslateResponsePayload, request: TranslateRequestPayload) => void
  onError?: (error: unknown, request: TranslateRequestPayload) => void
}

const attachRequestToError = (
  error: unknown,
  request: TranslateRequestPayload
) => {
  if (error instanceof Error) {
    const enriched = error as Error & { request?: TranslateRequestPayload }
    enriched.request = request
    return enriched
  }

  const wrapped = new Error(typeof error === 'string' ? error : 'Unknown error')
  const enriched = wrapped as Error & {
    request?: TranslateRequestPayload
    cause?: unknown
  }
  enriched.request = request
  enriched.cause = error
  return wrapped
}

export const createTranslationController = (deps: TranslationControllerDeps) => {
  const handleShortcut = async () => {
    const { text } = await deps.captureSelection()
    const trimmed = text.trim()

    if (!trimmed) return

    const request = deps.buildRequest(trimmed)

    try {
      const record = await deps.translate(request)
      deps.onResult?.(record, request)
      return { record, request }
    } catch (error) {
      const wrappedError = attachRequestToError(error, request)
      deps.onError?.(wrappedError, request)
      throw wrappedError
    }
  }

  return { handleShortcut }
}
