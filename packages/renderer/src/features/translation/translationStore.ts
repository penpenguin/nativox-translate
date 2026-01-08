import { useSyncExternalStore } from 'react'
import type {
  TranslateRequestPayload,
  TranslationShortcutResultPayload,
} from '@shared/translation/ipc'
import type { TranslationRecord } from '@shared/translation/types'
import { translationApi } from './api'

export type TranslationError = {
  title: string
  cause: string
}

export type TranslationState = {
  status: 'idle' | 'loading' | 'success' | 'error'
  record?: TranslationRecord
  error?: TranslationError
  lastRequest?: TranslateRequestPayload
  shortcutStartedAt?: number
  lastCopyDurationMs?: number
}

const initialState: TranslationState = {
  status: 'idle',
}

let state: TranslationState = { ...initialState }
const listeners = new Set<() => void>()
let shortcutUnsubscribe: (() => void) | null = null

const emit = () => {
  listeners.forEach((listener) => listener())
}

const setState = (partial: Partial<TranslationState>) => {
  state = { ...state, ...partial }
  emit()
}

const translate = async (payload: TranslateRequestPayload) => {
  setState({
    status: 'loading',
    error: undefined,
    lastRequest: payload,
    shortcutStartedAt: Date.now(),
  })

  try {
    const record = await translationApi.translate(payload)
    setState({
      status: 'success',
      record,
      error: undefined,
    })
  } catch (error) {
    setState({
      status: 'error',
      record: undefined,
      error: {
        title: 'Translation failed',
        cause: error instanceof Error ? error.message : 'Unknown error',
      },
    })
  }
}

const retry = async () => {
  if (!state.lastRequest) return
  await translate(state.lastRequest)
}

const markCopyCompleted = () => {
  if (!state.shortcutStartedAt) return
  setState({
    lastCopyDurationMs: Date.now() - state.shortcutStartedAt,
  })
}

const reset = () => {
  state = { ...initialState }
  emit()
}

const applyShortcutResult = (payload: TranslationShortcutResultPayload) => {
  const nextRequest = payload.request ?? state.lastRequest
  if (payload.status === 'success') {
    setState({
      status: 'success',
      record: payload.record,
      error: undefined,
      lastRequest: nextRequest,
    })
    return
  }

  setState({
    status: 'error',
    record: undefined,
    error: payload.error,
    lastRequest: nextRequest,
  })
}

const startListening = () => {
  if (shortcutUnsubscribe) return
  const api = window.translationApi
  if (!api?.onShortcutResult) return
  shortcutUnsubscribe = api.onShortcutResult((payload) => {
    applyShortcutResult(payload)
  })
}

const stopListening = () => {
  shortcutUnsubscribe?.()
  shortcutUnsubscribe = null
}

export const translationStore = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  translate,
  retry,
  markCopyCompleted,
  reset,
  startListening,
  stopListening,
}

export const useTranslationStore = () =>
  useSyncExternalStore(translationStore.subscribe, translationStore.getState)
