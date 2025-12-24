import type { ArtifactDef, FlowNode, NodeData } from './types'

export type SdlcPhase =
  | 'requirements'
  | 'design'
  | 'implementation'
  | 'test'
  | 'review'
  | 'deploy'

type SdlcDefaults = {
  label: string
  promptTemplate: string
  outputArtifacts: ArtifactDef[]
}

export const SDLC_PHASES: SdlcPhase[] = [
  'requirements',
  'design',
  'implementation',
  'test',
  'review',
  'deploy',
]

const DEFAULTS: Record<SdlcPhase, SdlcDefaults> = {
  requirements: {
    label: 'Requirements',
    promptTemplate:
      'Summarize the requirements and produce a requirements doc.',
    outputArtifacts: [{ name: 'spec', path: 'docs/requirements.md' }],
  },
  design: {
    label: 'Design',
    promptTemplate: 'Draft a design outline and key architecture decisions.',
    outputArtifacts: [{ name: 'design', path: 'docs/design.md' }],
  },
  implementation: {
    label: 'Implementation',
    promptTemplate: 'Implement the planned changes and summarize the diff.',
    outputArtifacts: [{ name: 'summary', path: 'docs/implementation.md' }],
  },
  test: {
    label: 'Test',
    promptTemplate: 'Add or update tests for the implemented changes.',
    outputArtifacts: [{ name: 'results', path: 'docs/test-results.md' }],
  },
  review: {
    label: 'Review',
    promptTemplate: 'Review changes and highlight risks or follow-ups.',
    outputArtifacts: [{ name: 'review', path: 'docs/review.md' }],
  },
  deploy: {
    label: 'Deploy',
    promptTemplate: 'Prepare deployment notes and rollout steps.',
    outputArtifacts: [{ name: 'deploy', path: 'docs/deploy.md' }],
  },
}

export const getSdlcDefaults = (phase: string): SdlcDefaults | null => {
  if (phase in DEFAULTS) {
    return DEFAULTS[phase as SdlcPhase]
  }
  return null
}

export const applySdlcDefaults = (node: FlowNode): FlowNode => {
  const defaults = getSdlcDefaults(node.type)
  if (!defaults) return node
  const data: NodeData = {
    ...node.data,
    label: node.data.label || defaults.label,
    promptTemplate: node.data.promptTemplate ?? defaults.promptTemplate,
    outputArtifacts: node.data.outputArtifacts ?? defaults.outputArtifacts,
  }
  return { ...node, data }
}
