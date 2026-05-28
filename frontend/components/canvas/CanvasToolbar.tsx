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
      <span className="text-lg font-semibold text-accent tracking-tight flex-shrink-0">
        Genesis
      </span>

      <div className="w-px h-4 bg-border-1 flex-shrink-0" />

      {/* Workflow name */}
      <span className="text-sm font-mono text-text-tertiary truncate min-w-0">
        {workflowName ?? 'New Workflow'}
      </span>

      {/* Build stage progress dots — only while building */}
      {isBuilding && stageIndex >= 0 && (
        <>
          <div className="w-px h-4 bg-border-1 flex-shrink-0" />
          <div className="flex items-center gap-2 overflow-hidden">
            {BUILD_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-normal',
                    i < stageIndex
                      ? 'bg-accent'
                      : i === stageIndex
                        ? 'bg-accent animate-pulse-subtle'
                        : 'bg-border-2',
                  ].join(' ')}
                />
                <span
                  className={[
                    'text-xs',
                    i === stageIndex ? 'text-text-primary' : 'text-text-tertiary',
                  ].join(' ')}
                >
                  {stage}
                </span>
                {i < BUILD_STAGES.length - 1 && (
                  <span className="text-xs text-border-2">·</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status label when idle / done */}
      {!isBuilding && buildStatus !== 'idle' && (
        <>
          <div className="w-px h-4 bg-border-1 flex-shrink-0" />
          <div className="flex items-center gap-2">
            <StatusDot state={dotState} />
            <Label>{buildStatus.replace(/_/g, ' ')}</Label>
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* Graph stats */}
      {nodeCount > 0 && (
        <Label className="flex-shrink-0 hidden sm:block">
          {nodeCount} agents · {edgeCount} edges
        </Label>
      )}

      {nodeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearCanvas}>
          Clear
        </Button>
      )}

      {/* Templates — plain anchor styled as button */}
      <a
        href="/templates"
        target="_blank"
        rel="noreferrer"
        className="btn btn--ghost btn--sm"
      >
        Templates
      </a>

      <Button variant="secondary" size="sm" onClick={onNewBuild}>
        New Build
      </Button>

      {/* Connection indicator */}
      <div className="flex items-center gap-2 flex-shrink-0 pl-3 border-l border-border-1">
        <StatusDot state={connected ? 'active' : 'error'} />
        <Label className="hidden sm:block">{connected ? 'Connected' : 'Disconnected'}</Label>
      </div>
    </div>
  )
}
