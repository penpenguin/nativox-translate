import React, { useEffect, useState } from 'react'
import type { AgentConfig, TranslationSettings } from '@shared/translation/types'
import { translationApi } from './api'

const defaultSettings: TranslationSettings = {
  systemPrompt: '',
  customPrompt: '',
  targetLanguage: 'en',
  backTranslate: false,
  agentTimeoutMs: 60000,
  updatedAt: new Date(0).toISOString(),
}

export const SettingsView = () => {
  const [settings, setSettings] = useState<TranslationSettings>(defaultSettings)
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  useEffect(() => {
    let active = true

    const load = async () => {
      const loadedSettings = await translationApi.getPromptSettings()
      const configs = await translationApi.listAgentConfigs()
      if (!active) return
      setSettings(loadedSettings)
      setAgentConfigs(configs)
      const selected = configs.find((config) => config.isDefault) ?? configs[0] ?? null
      setSelectedAgentId(selected?.agentId ?? '')
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const selectedAgent =
    agentConfigs.find((config) => config.agentId === selectedAgentId) ?? null

  const formatArg = (arg: string) => {
    if (arg.length === 0) return '""'
    if (/[\s"]/u.test(arg)) {
      return `"${arg.replace(/([\\"])/gu, '\\$1')}"`
    }
    return arg
  }

  const formatArgs = (args?: string[]) =>
    (args ?? []).map((arg) => formatArg(arg)).join(' ')

  const parseArgs = (value: string) => {
    const result: string[] = []
    let current = ''
    let inSingle = false
    let inDouble = false
    let escaped = false

    const push = () => {
      if (current.length === 0) return
      result.push(current)
      current = ''
    }

    for (const char of value.trim()) {
      if (escaped) {
        current += char
        escaped = false
        continue
      }

      if (char === '\\' && !inSingle) {
        escaped = true
        continue
      }

      if (char === "'" && !inDouble) {
        inSingle = !inSingle
        continue
      }

      if (char === '"' && !inSingle) {
        inDouble = !inDouble
        continue
      }

      if (!inSingle && !inDouble && /\s/u.test(char)) {
        push()
        continue
      }

      current += char
    }

    if (current.length > 0) {
      result.push(current)
    }

    return result
  }

  const save = async () => {
    await translationApi.updatePromptSettings(settings)
    if (!selectedAgent) return
    const updatedAt = new Date().toISOString()
    const nextConfigs = agentConfigs.map((config) => ({
      ...config,
      isDefault: config.agentId === selectedAgent.agentId,
      updatedAt,
    }))
    const updates = nextConfigs.filter((config) => {
      if (config.agentId === selectedAgent.agentId) return true
      const previous = agentConfigs.find((item) => item.agentId === config.agentId)
      return Boolean(previous?.isDefault)
    })
    await Promise.all(
      updates.map((config) => translationApi.updateAgentConfig(config))
    )
    setAgentConfigs(nextConfigs)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <p data-testid="settings-help">
        ショートカット翻訳で使用する設定です。保存後に反映されます。
      </p>
      <section>
        <label>
          System prompt
          <textarea
            data-testid="system-prompt"
            value={settings.systemPrompt ?? ''}
            onInput={(event) => {
              const value = (event.target as HTMLTextAreaElement).value
              setSettings((previous) => ({
                ...previous,
                systemPrompt: value,
              }))
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Custom prompt
          <textarea
            data-testid="custom-prompt"
            value={settings.customPrompt ?? ''}
            onInput={(event) => {
              const value = (event.target as HTMLTextAreaElement).value
              setSettings((previous) => ({
                ...previous,
                customPrompt: value,
              }))
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Target language
          <input
            data-testid="target-language"
            type="text"
            value={settings.targetLanguage}
            onInput={(event) => {
              const value = (event.target as HTMLInputElement).value
              setSettings((previous) => ({
                ...previous,
                targetLanguage: value,
              }))
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Back-translation
          <input
            data-testid="back-translate"
            type="checkbox"
            checked={settings.backTranslate}
            onChange={(event) => {
              const checked = event.target.checked
              setSettings((previous) => ({
                ...previous,
                backTranslate: checked,
              }))
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Agent timeout (seconds)
          <input
            data-testid="agent-timeout"
            type="number"
            min={1}
            value={Math.max(1, Math.round(settings.agentTimeoutMs / 1000))}
            onInput={(event) => {
              const value = Number((event.target as HTMLInputElement).value)
              const seconds =
                Number.isFinite(value) && value > 0 ? Math.round(value) : 1
              setSettings((previous) => ({
                ...previous,
                agentTimeoutMs: seconds * 1000,
              }))
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Agent
          <select
            data-testid="agent-select"
            value={selectedAgentId}
            onChange={(event) => {
              setSelectedAgentId(event.target.value)
            }}
          >
            {agentConfigs.map((config) => (
              <option key={config.agentId} value={config.agentId}>
                {config.displayName}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <label>
          Agent command
          <input
            data-testid="agent-command"
            type="text"
            value={selectedAgent?.command ?? ''}
            onInput={(event) => {
              if (!selectedAgent) return
              const value = (event.target as HTMLInputElement).value
              setAgentConfigs((previous) =>
                previous.map((config) =>
                  config.agentId === selectedAgent.agentId
                    ? { ...config, command: value }
                    : config
                )
              )
            }}
          />
        </label>
      </section>

      <section>
        <label>
          Agent args
          <input
            data-testid="agent-args"
            type="text"
            value={formatArgs(selectedAgent?.args)}
            onInput={(event) => {
              if (!selectedAgent) return
              const value = (event.target as HTMLInputElement).value
              setAgentConfigs((previous) =>
                previous.map((config) =>
                  config.agentId === selectedAgent.agentId
                    ? { ...config, args: parseArgs(value) }
                    : config
                )
              )
            }}
          />
        </label>
      </section>

      <button data-testid="save-settings" type="submit">
        Save
      </button>
    </form>
  )
}
