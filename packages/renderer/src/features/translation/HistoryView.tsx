import React, { useEffect, useState } from 'react'
import type { TranslationRecord } from '@shared/translation/types'
import { translationApi } from './api'

export const HistoryView = () => {
  const [history, setHistory] = useState<TranslationRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      const records = await translationApi.listHistory({ limit: 100, offset: 0 })
      if (!active) return
      setHistory(records)
      setSelectedId((current) => current ?? records[0]?.id ?? null)
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const selected = history.find((record) => record.id === selectedId) ?? null

  return (
    <div>
      <ul>
        {history.map((record) => (
          <li key={record.id}>
            <button
              data-testid={`history-item-${record.id}`}
              type="button"
              onClick={() => setSelectedId(record.id)}
            >
              {record.sourceText}
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <section>
          <h2>Details</h2>
          <p data-testid="history-detail-source">{selected.sourceText}</p>
          <p data-testid="history-detail-translation">
            {selected.translatedText}
          </p>
        </section>
      ) : null}
    </div>
  )
}
