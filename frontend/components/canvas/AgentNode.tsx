'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Badge, StatusDot } from '@/components/ui'
import type { AgentLayer, AgentStatus } from '@/lib/types'

export interface AgentNodeData extends Record<string, unknown> {
  label: string
  role: string
  layer: AgentLayer
  model: string
  tools: string[]
  status: AgentStatus
  systemPromptPreview: string
}

// CSS-variable accent per layer — inlined only on the 2px bar which needs a
// dynamic background; everything else uses Tailwind semantic classes.
const LAYER_CSS_VAR: Record<AgentLayer, string> = {
  meta:      'var(--layer-meta)',
  build:     'var(--layer-build)',
  validate:  'var(--layer-validate)',
  ops:       'var(--layer-ops)',
  generated: 'var(--layer-generated)',
}

// Badge variant maps to our existing design-system variants
const LAYER_BADGE: Record<AgentLayer, 'meta' | 'build' | 'validate' | 'ops' | 'accent'> = {
  meta:      'meta',
  build:     'build',
  validate:  'validate',
  ops:       'ops',
  generated: 'accent',
}

const STATUS_DOT_STATE: Record<AgentStatus, 'active' | 'idle' | 'error' | 'building'> = {
  active:   'active',
  idle:     'idle',
  error:    'error',
  building: 'building',
}

function AgentNodeInner({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const accentVar = LAYER_CSS_VAR[d.layer]

  return (
    <div
      className={[
        'relative w-[140px] rounded-md overflow-hidden',
        'transition-colors duration-fast ease-default',
        'cursor-default select-none',
        selected
          ? 'bg-surface-3 border border-border-3'
          : 'bg-surface-1 border border-border-1 hover:bg-surface-2',
      ].join(' ')}
    >
      {/* Layer accent bar — must be dynamic, uses CSS variable */}
      <div
        className="h-0.5 w-full"
        style={{ background: accentVar }}
      />

      <div className="px-[10px] pt-2 pb-2 flex flex-col gap-1">
        {/* Layer badge — top-right, absolute */}
        <div className="absolute top-2 right-2">
          <Badge variant={LAYER_BADGE[d.layer]} className="text-[8px] py-0">
            {d.layer}
          </Badge>
        </div>

        {/* Agent name */}
        <p className="text-md font-semibold text-text-primary tracking-tight leading-tight truncate pr-6 mt-1">
          {d.label}
        </p>

        {/* Role */}
        <p className="text-xs text-text-tertiary truncate">
          {d.role}
        </p>

        {/* Model */}
        <p className="text-xs font-mono text-text-tertiary truncate" style={{ color: 'var(--text-placeholder)' }}>
          {d.model}
        </p>

        {/* Footer: tools + status */}
        <div className="flex items-center justify-between mt-1">
          <Badge variant="default" className="text-[9px]">
            {d.tools.length} tool{d.tools.length !== 1 ? 's' : ''}
          </Badge>
          <StatusDot state={STATUS_DOT_STATE[d.status]} />
        </div>
      </div>

      {/* ReactFlow handles — use CSS variables, not raw hex */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8,
          height: 8,
          background: 'var(--border-2)',
          border: '1px solid var(--border-3)',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8,
          height: 8,
          background: 'var(--border-2)',
          border: '1px solid var(--border-3)',
        }}
      />
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
