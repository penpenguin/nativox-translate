import { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import type {
  Flow,
  FlowLoadResult,
  PendingApproval,
  RunRecord,
  WorktreeRecord,
} from '@shared/types'
import { CURRENT_FLOW_SCHEMA_VERSION } from '@shared/types'
import type { AppStatus, MigrationStatus } from '@shared/ipc'
import { SDLC_PHASES, getSdlcDefaults } from '@shared/sdlcDefaults'

const createBlankFlow = (): Flow => ({
  id: `flow-${Date.now()}`,
  name: 'New Flow',
  schemaVersion: CURRENT_FLOW_SCHEMA_VERSION,
  nodes: [],
  edges: [],
  meta: { createdAt: new Date().toISOString() },
})

const toReactFlowNodes = (flow: Flow): Node[] =>
  flow.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: {
      label: node.data.label,
      flowType: node.type,
      promptTemplate: node.data.promptTemplate,
      outputArtifacts: node.data.outputArtifacts,
    },
  }))

const toReactFlowEdges = (flow: Flow): Edge[] =>
  flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
  }))

const buildFlowFromState = (flow: Flow, nodes: Node[], edges: Edge[]): Flow => {
  const originalNodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const updatedNodes = nodes.map((node) => {
    const original = originalNodes.get(node.id)
    const data = node.data as {
      label?: string
      flowType?: string
      promptTemplate?: string
      outputArtifacts?: Flow['nodes'][number]['data']['outputArtifacts']
    }
    return {
      id: node.id,
      type: data.flowType ?? original?.type ?? 'task',
      position: node.position,
      data: {
        ...(original?.data ?? {}),
        label: data.label ?? original?.data.label ?? node.id,
        promptTemplate: data.promptTemplate ?? original?.data.promptTemplate,
        outputArtifacts: data.outputArtifacts ?? original?.data.outputArtifacts,
      },
    }
  })

  const updatedEdges = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
  }))

  return { ...flow, nodes: updatedNodes, edges: updatedEdges }
}

const App = () => {
  const [flows, setFlows] = useState<FlowLoadResult[]>([])
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [migrationStatus, setMigrationStatus] =
    useState<MigrationStatus | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeRecord[]>([])
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [phase, setPhase] = useState<string>('requirements')

  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.flow.id === selectedFlowId) ?? null,
    [flows, selectedFlowId]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const reloadFlows = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.flows.list()
    if (result.ok) {
      setFlows(result.data)
      if (!selectedFlowId && result.data[0]) {
        setSelectedFlowId(result.data[0].flow.id)
      }
    } else {
      setMessage(`Flow load error: ${result.error.message}`)
    }
  }

  const reloadRuns = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.runs.list()
    if (result.ok) {
      setRuns(result.data)
    }
  }

  const reloadWorktrees = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.worktrees.list()
    if (result.ok) {
      setWorktrees(result.data)
    }
  }

  const reloadStatus = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.status.get()
    if (result.ok) {
      setStatus(result.data)
    }
  }

  const reloadSession = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.session.get()
    if (result.ok && result.data?.flowId) {
      setSelectedFlowId(result.data.flowId)
    }
  }

  const reloadMigrations = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.migrations.get()
    if (result.ok) {
      setMigrationStatus(result.data)
    }
  }

  const reloadApprovals = async () => {
    if (!window.lumberjack) return
    const result = await window.lumberjack.approval.list()
    if (result.ok) {
      setApprovals(result.data)
    }
  }

  const reloadAll = async () => {
    await reloadSession()
    await Promise.all([
      reloadStatus(),
      reloadMigrations(),
      reloadFlows(),
      reloadRuns(),
      reloadWorktrees(),
      reloadApprovals(),
    ])
  }

  useEffect(() => {
    void reloadAll()
  }, [])

  useEffect(() => {
    if (!selectedFlow) {
      setNodes([])
      setEdges([])
      return
    }
    setNodes(toReactFlowNodes(selectedFlow.flow))
    setEdges(toReactFlowEdges(selectedFlow.flow))
  }, [selectedFlow, setNodes, setEdges])

  useEffect(() => {
    if (!window.lumberjack) return
    void window.lumberjack.session.save(selectedFlowId ?? null)
  }, [selectedFlowId])

  const onConnect = (connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}` }, eds))
  }

  const handleSave = async () => {
    if (!window.lumberjack || !selectedFlow) return
    if (selectedFlow.readOnly) {
      setMessage('This flow is read-only due to schema mismatch.')
      return
    }
    const updated = buildFlowFromState(selectedFlow.flow, nodes, edges)
    const result = await window.lumberjack.flows.save(updated)
    if (result.ok) {
      setMessage('Flow saved')
      await reloadFlows()
    } else {
      setMessage(`Save failed: ${result.error.message}`)
    }
  }

  const handleNewFlow = async () => {
    if (!window.lumberjack) return
    const flow = createBlankFlow()
    const result = await window.lumberjack.flows.save(flow)
    if (result.ok) {
      setSelectedFlowId(flow.id)
      await reloadFlows()
    }
  }

  const handleAddNode = () => {
    if (!selectedFlow) return
    const defaults = getSdlcDefaults(phase)
    const id = `node-${Date.now()}`
    const nodeData = {
      label: defaults?.label ?? 'Node',
      flowType: phase,
      promptTemplate: defaults?.promptTemplate,
      outputArtifacts: defaults?.outputArtifacts,
    }
    setNodes((current) => [
      ...current,
      {
        id,
        position: {
          x: 80 + current.length * 40,
          y: 80 + current.length * 30,
        },
        data: nodeData,
      },
    ])
  }

  const handleApprove = async (id: string) => {
    if (!window.lumberjack) return
    await window.lumberjack.approval.approve(id)
    await reloadApprovals()
  }

  const handleReject = async (id: string) => {
    if (!window.lumberjack) return
    await window.lumberjack.approval.reject(id)
    await reloadApprovals()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Lumberjack Orchestrator</p>
          <h1>Flow Studio</h1>
        </div>
        <div className="status-panel">
          <div className="status-line">
            <span className="status-label">Version</span>
            <span>{status?.appVersion ?? '—'}</span>
          </div>
          <div className="status-line">
            <span className="status-label">Platform</span>
            <span>{status?.platform ?? '—'}</span>
          </div>
          <div className="status-line">
            <span className="status-label">Runs</span>
            <span>{runs.length}</span>
          </div>
        </div>
      </header>

      {migrationStatus?.error && (
        <div className="banner banner-error">
          Migration failed: {migrationStatus.error.message}
        </div>
      )}
      {message && <div className="banner">{message}</div>}

      <div className="content-grid">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-header">
              <h2>Flows</h2>
              <button className="btn" onClick={reloadFlows}>
                Refresh
              </button>
            </div>
            <div className="panel-body">
              <button className="btn btn-primary" onClick={handleNewFlow}>
                New Flow
              </button>
              <ul className="list">
                {flows.map((flow) => (
                  <li key={flow.flow.id}>
                    <button
                      className={
                        flow.flow.id === selectedFlowId
                          ? 'list-item active'
                          : 'list-item'
                      }
                      onClick={() => setSelectedFlowId(flow.flow.id)}
                    >
                      <span>{flow.flow.name}</span>
                      {flow.readOnly && <span className="pill">Read-only</span>}
                      {flow.migrated && <span className="pill">Migrated</span>}
                    </button>
                  </li>
                ))}
                {!flows.length && <li className="empty">No flows yet</li>}
              </ul>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Worktrees</h2>
              <button className="btn" onClick={reloadWorktrees}>
                Refresh
              </button>
            </div>
            <div className="panel-body">
              <ul className="list">
                {worktrees.map((wt) => (
                  <li key={wt.id}>
                    <div className="list-item static">
                      <div>
                        <strong>{wt.branch}</strong>
                        <p className="muted">{wt.path}</p>
                      </div>
                      <div className="panel-actions">
                        <button
                          className="btn"
                          onClick={() =>
                            window.lumberjack?.worktrees.merge(wt.id)
                          }
                          disabled={wt.status !== 'active'}
                        >
                          Merge
                        </button>
                        <button
                          className="btn"
                          onClick={() =>
                            window.lumberjack?.worktrees.remove(wt.id)
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <span className={`pill pill-${wt.status}`}>
                        {wt.status}
                      </span>
                    </div>
                  </li>
                ))}
                {!worktrees.length && (
                  <li className="empty">No worktrees tracked</li>
                )}
              </ul>
            </div>
          </div>
        </aside>

        <main className="main-area">
          <div className="panel flow-panel">
            <div className="panel-header">
              <h2>Flow Editor</h2>
              <div className="panel-actions">
                <select
                  value={phase}
                  onChange={(event) => setPhase(event.target.value)}
                >
                  {SDLC_PHASES.map((phaseOption) => (
                    <option key={phaseOption} value={phaseOption}>
                      {phaseOption}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={handleAddNode}>
                  Add Node
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                  Save Flow
                </button>
              </div>
            </div>
            <div className="panel-body flow-body">
              {selectedFlow ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  fitView
                >
                  <Background gap={24} size={1} />
                  <MiniMap />
                  <Controls />
                </ReactFlow>
              ) : (
                <div className="empty">Select a flow to edit.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Runs</h2>
              <button className="btn" onClick={reloadRuns}>
                Refresh
              </button>
            </div>
            <div className="panel-body">
              <ul className="list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <div className="list-item static">
                      <div>
                        <strong>{run.flowId}</strong>
                        <p className="muted">{run.id}</p>
                      </div>
                      {run.state === 'interrupted' && (
                        <div className="panel-actions">
                          <button className="btn" disabled>
                            Resume
                          </button>
                          <button className="btn" disabled>
                            Re-run
                          </button>
                        </div>
                      )}
                      <span className={`pill pill-${run.state}`}>
                        {run.state}
                      </span>
                    </div>
                  </li>
                ))}
                {!runs.length && <li className="empty">No runs yet</li>}
              </ul>
              <div className="log-box">
                <strong>Logs</strong>
                <p className="muted">No log stream connected yet.</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      {approvals.length > 0 && (
        <div className="modal">
          <div className="modal-card">
            <h3>Command Approval</h3>
            <p className="muted">Review new commands before execution.</p>
            <ul className="list">
              {approvals.map((approval) => (
                <li key={approval.id}>
                  <div className="list-item static">
                    <div>
                      <strong>{approval.commandPath}</strong>
                      <p className="muted">{approval.args.join(' ')}</p>
                    </div>
                    <div className="panel-actions">
                      <button
                        className="btn"
                        onClick={() => handleReject(approval.id)}
                      >
                        Reject
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleApprove(approval.id)}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
