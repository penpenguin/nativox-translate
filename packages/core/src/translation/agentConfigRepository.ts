import type { AgentConfig } from '@shared/translation/types'

export type AgentConfigRepositoryDeps = {
  now?: () => Date
  initial?: AgentConfig[]
}

export const createAgentConfigRepository = (
  deps: AgentConfigRepositoryDeps = {}
) => {
  const now = deps.now ?? (() => new Date())
  let configs = [...(deps.initial ?? [])]

  const listConfigs = () => [...configs]

  const saveConfig = (config: AgentConfig) => {
    const updated: AgentConfig = {
      ...config,
      updatedAt: config.updatedAt || now().toISOString(),
    }
    const index = configs.findIndex((item) => item.agentId === config.agentId)
    if (index >= 0) {
      configs[index] = updated
    } else {
      configs.push(updated)
    }
    return updated
  }

  const getDefaultConfig = () => {
    const defaults = configs.filter((config) => config.isDefault)
    if (defaults.length === 0) return null
    return defaults.reduce((latest, current) => {
      return new Date(current.updatedAt) > new Date(latest.updatedAt)
        ? current
        : latest
    })
  }

  return { listConfigs, saveConfig, getDefaultConfig }
}
