import React, { useEffect } from 'react'
import { TranslationView, SettingsView, HistoryView } from './features/translation'
import { translationStore } from './features/translation/translationStore'

export const App = () => {
  useEffect(() => {
    translationStore.startListening()
    return () => translationStore.stopListening()
  }, [])

  return (
    <div>
      <header>
        <h1>Nativox Translate</h1>
      </header>

      <main>
        <section>
          <h2>Translation</h2>
          <TranslationView />
        </section>

        <section>
          <h2>Settings</h2>
          <SettingsView />
        </section>

        <section>
          <h2>History</h2>
          <HistoryView />
        </section>
      </main>
    </div>
  )
}
