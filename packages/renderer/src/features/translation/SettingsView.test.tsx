import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsView } from './SettingsView'

let activeRoot: ReturnType<typeof createRoot> | null = null
let activeContainer: HTMLDivElement | null = null

const renderView = () => {
  activeContainer = document.createElement('div')
  document.body.appendChild(activeContainer)
  activeRoot = createRoot(activeContainer)
  act(() => {
    activeRoot?.render(<SettingsView />)
  })
}

const flushPromises = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('SettingsView', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (activeRoot) {
      act(() => {
        activeRoot?.unmount()
      })
    }
    activeRoot = null
    if (activeContainer) {
      activeContainer.remove()
    }
    activeContainer = null
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = ''
  })

  it('renders settings and saves updates', async () => {
    const updatePromptSettings = vi.fn().mockResolvedValue({
      systemPrompt: 'system-updated',
      customPrompt: 'custom-updated',
      targetLanguage: 'fr',
      backTranslate: true,
      agentTimeoutMs: 60000,
      updatedAt: '2026-01-07T00:00:00.000Z',
    })
    const updateAgentConfig = vi.fn().mockResolvedValue({
      agentId: 'claude',
      displayName: 'Claude',
      command: 'claude-new',
      args: ['-p', 'New prompt', '--output-format', 'text'],
      isDefault: true,
      updatedAt: '2026-01-07T00:00:00.000Z',
    })

    window.translationApi = {
      getPromptSettings: vi.fn().mockResolvedValue({
        systemPrompt: 'system',
        customPrompt: 'custom',
        targetLanguage: 'es',
        backTranslate: false,
        agentTimeoutMs: 60000,
        updatedAt: '2026-01-07T00:00:00.000Z',
      }),
      updatePromptSettings,
      listAgentConfigs: vi.fn().mockResolvedValue([
        {
          agentId: 'codex',
          displayName: 'Codex',
          command: 'codex',
          args: [
            'exec',
            '--output-schema',
            'packages/shared/src/translation/translationOutput.schema.json',
            '-',
          ],
          isDefault: true,
          updatedAt: '2026-01-07T00:00:00.000Z',
        },
        {
          agentId: 'claude',
          displayName: 'Claude',
          command: 'claude',
          args: ['-p', 'Default prompt', '--output-format', 'text'],
          isDefault: false,
          updatedAt: '2026-01-07T00:00:00.000Z',
        },
      ]),
      updateAgentConfig,
    } as unknown as typeof window.translationApi

    renderView()

    await act(async () => {
      await flushPromises()
    })

    const systemPrompt = document.querySelector(
      '[data-testid="system-prompt"]'
    ) as HTMLTextAreaElement
    const customPrompt = document.querySelector(
      '[data-testid="custom-prompt"]'
    ) as HTMLTextAreaElement
    const targetLanguage = document.querySelector(
      '[data-testid="target-language"]'
    ) as HTMLInputElement
    const backTranslate = document.querySelector(
      '[data-testid="back-translate"]'
    ) as HTMLInputElement
    const agentTimeout = document.querySelector(
      '[data-testid="agent-timeout"]'
    ) as HTMLInputElement
    const agentSelect = document.querySelector(
      '[data-testid="agent-select"]'
    ) as HTMLSelectElement
    const agentCommand = document.querySelector(
      '[data-testid="agent-command"]'
    ) as HTMLInputElement
    const agentArgs = document.querySelector(
      '[data-testid="agent-args"]'
    ) as HTMLInputElement

    expect(systemPrompt.value).toBe('system')
    expect(customPrompt.value).toBe('custom')
    expect(targetLanguage.value).toBe('es')
    expect(backTranslate.checked).toBe(false)
    expect(agentTimeout.value).toBe('60')
    expect(agentSelect.value).toBe('codex')
    expect(agentCommand.value).toBe('codex')
    expect(agentArgs.value).toBe(
      'exec --output-schema packages/shared/src/translation/translationOutput.schema.json -'
    )

    await act(async () => {
      systemPrompt.value = 'system-updated'
      systemPrompt.dispatchEvent(new Event('input', { bubbles: true }))
      customPrompt.value = 'custom-updated'
      customPrompt.dispatchEvent(new Event('input', { bubbles: true }))
      targetLanguage.value = 'fr'
      targetLanguage.dispatchEvent(new Event('input', { bubbles: true }))
      backTranslate.click()
      agentTimeout.value = '90'
      agentTimeout.dispatchEvent(new Event('input', { bubbles: true }))
      agentSelect.value = 'claude'
      agentSelect.dispatchEvent(new Event('change', { bubbles: true }))
      agentCommand.value = 'claude-new'
      agentCommand.dispatchEvent(new Event('input', { bubbles: true }))
      agentArgs.value = '-p \"New prompt\" --output-format text'
      agentArgs.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
    })

    const saveButton = document.querySelector(
      '[data-testid="save-settings"]'
    ) as HTMLButtonElement

    await act(async () => {
      saveButton.click()
      await flushPromises()
    })

    expect(updatePromptSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'system-updated',
        customPrompt: 'custom-updated',
        targetLanguage: 'fr',
        backTranslate: true,
        agentTimeoutMs: 90000,
      })
    )
    expect(updateAgentConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'claude',
        command: 'claude-new',
        args: ['-p', 'New prompt', '--output-format', 'text'],
        isDefault: true,
      })
    )
    expect(updateAgentConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'codex',
        isDefault: false,
      })
    )
  })
})
