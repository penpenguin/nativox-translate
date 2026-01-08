import React from 'react'
import { translationStore, useTranslationStore } from './translationStore'

export const TranslationView = () => {
  const state = useTranslationStore()

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText?.(text)
    } finally {
      translationStore.markCopyCompleted()
    }
  }

  return (
    <div>
      {state.error ? (
        <div data-testid="error-banner" role="alert">
          <strong>Translation failed</strong>
          <span>{state.error.cause}</span>
          <button
            data-testid="retry-translation"
            type="button"
            onClick={() => {
              void translationStore.retry()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.record ? (
        <div>
          <section>
            <h2>Source</h2>
            <p>{state.record.sourceText}</p>
            <button
              data-testid="copy-source"
              type="button"
              onClick={() => {
                void handleCopy(state.record?.sourceText ?? '')
              }}
            >
              Copy
            </button>
          </section>

          <section>
            <h2>Translation</h2>
            <p>{state.record.translatedText}</p>
            <button
              data-testid="copy-translation"
              type="button"
              onClick={() => {
                void handleCopy(state.record?.translatedText ?? '')
              }}
            >
              Copy
            </button>
          </section>

          {state.record.backTranslatedText ? (
            <section>
              <h2>Back Translation</h2>
              <p>{state.record.backTranslatedText}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
