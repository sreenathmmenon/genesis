'use client'

import { Button, Label, StatusDot } from '@/components/ui'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'

const BUILD_STAGES = ['Analyzing', 'Designing', 'Building', 'Reviewing', 'Validating', 'Ready']

const STATUS_DOT_MAP: Record<string, 'active' | 'idle' | 'error' | 'building' | 'info'> = {
  idle:               'idle',
  decomposing:        'building',
  building:           'building',
  critiquing:         'info',
  validating:         'info',
  awaiting_approval:  'active',
  deployed:           'active',
  failed:             'error',
}

const STAGE_FROM_STATUS: Record<string, number> = {
  decomposing: 0, building: 2, critiquing: 3, validating: 4,
  awaiting_approval: 5, deployed: 5,
}

interface CanvasToolbarProps {
  workflowName?: string
  onNewBuild?: () => void
}

export function CanvasToolbar({ workflowName, onNewBuild }: CanvasToolbarProps) {
  const buildStatus = useGenesisStore((s) => s.buildStatus)
  const isBuilding = useGenesisStore((s) => s.isBuilding)
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)
  const nodeCount = useGenesisStore((s) => s.nodes.length)
  const edgeCount = useGenesisStore((s) => s.edges.length)

  const { connected } = useWebSocket()
  const dotState = STATUS_DOT_MAP[buildStatus] ?? 'idle'
  const stageIndex = STAGE_FROM_STATUS[buildStatus] ?? -1

  return (
    <div className="layout-toolbar">

      {/* Brand */}
      <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--accent)', letterSpacing: '-0.02em', flexShrink: 0 }}>
        Genesis
      </span>

      <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />

      {/* Workflow name */}
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {workflowName ?? 'New Workflow'}
      </span>

      {/* Build stage progress dots — only while building */}
      {isBuilding && stageIndex >= 0 && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {BUILD_STAGES.map((stage, i) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: i <= stageIndex ? 'var(--accent)' : 'var(--border-2)',
                  opacity: i === stageIndex ? 1 : 0.7,
                }} />
                <span style={{
                  fontSize: 12,
                  color: i === stageIndex ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}>
                  {stage}
                </span>
                {i < BUILD_STAGES.length - 1 && (
                  <span style={{ fontSize: 12, color: 'var(--border-2)' }}>·</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status label when idle / done */}
      {!isBuilding && buildStatus !== 'idle' && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot state={dotState} />
            <Label>{buildStatus.replace(/_/g, ' ')}</Label>
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Graph stats */}
      {nodeCount > 0 && (
        <Label style={{ flexShrink: 0 }}>
          {nodeCount} agents · {edgeCount} edges
        </Label>
      )}

      {nodeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearCanvas}>
          Clear
        </Button>
      )}

      <a href="/workflows" className="btn btn--ghost btn--sm">
        My Agents
      </a>

      <a href="/templates" className="btn btn--ghost btn--sm">
        Templates
      </a>

      <Button variant="secondary" size="sm" onClick={onNewBuild}>
        New Build
      </Button>

      {/* Connection indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 12, borderLeft: '1px solid var(--border-1)' }}>
        <StatusDot state={connected ? 'active' : 'error'} />
        <Label>{connected ? 'Connected' : 'Disconnected'}</Label>
      </div>
    </div>
  )
}
