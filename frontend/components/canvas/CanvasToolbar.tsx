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
      <span style={{ fontWeight: 700, fontSize: 15, color: '#111827', letterSpacing: '-0.02em', flexShrink: 0 }}>
        Genesis
      </span>

      <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />

      {/* Workflow name */}
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {workflowName ?? 'New Workflow'}
      </span>

      {/* Build stage progress dots — only while building */}
      {isBuilding && stageIndex >= 0 && (
        <>
          <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {BUILD_STAGES.map((stage, i) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: i <= stageIndex ? '#16A34A' : '#D1D5DB',
                  opacity: i === stageIndex ? 1 : 0.7,
                }} />
                <span style={{
                  fontSize: 12,
                  color: i === stageIndex ? '#111827' : '#6B7280',
                  fontWeight: i === stageIndex ? 500 : 400,
                }}>
                  {stage}
                </span>
                {i < BUILD_STAGES.length - 1 && (
                  <span style={{ fontSize: 12, color: '#D1D5DB' }}>·</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status label when idle / done */}
      {!isBuilding && buildStatus !== 'idle' && (
        <>
          <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        paddingLeft: 12, borderLeft: '1px solid #E5E7EB',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? '#16A34A' : '#DC2626',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 12,
          color: connected ? '#15803D' : '#DC2626',
          fontWeight: 500,
          background: connected ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${connected ? '#BBF7D0' : '#FCA5A5'}`,
          borderRadius: 4,
          padding: '2px 8px',
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  )
}
