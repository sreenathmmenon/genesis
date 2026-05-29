'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Badge } from '@/components/ui'
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

const LAYER_CSS_VAR: Record<AgentLayer, string> = {
  meta:      'var(--layer-meta)',
  build:     'var(--layer-build)',
  validate:  'var(--layer-validate)',
  ops:       'var(--layer-ops)',
  generated: 'var(--layer-generated)',
}

const LAYER_GLOW: Record<AgentLayer, string> = {
  meta:      'rgba(173, 255, 47, 0.2)',
  build:     'rgba(249, 115, 22, 0.2)',
  validate:  'rgba(56, 189, 248, 0.2)',
  ops:       'rgba(167, 139, 250, 0.2)',
  generated: 'rgba(173, 255, 47, 0.2)',
}

const LAYER_BADGE: Record<AgentLayer, 'meta' | 'build' | 'validate' | 'ops' | 'accent'> = {
  meta:      'meta',
  build:     'build',
  validate:  'validate',
  ops:       'ops',
  generated: 'accent',
}

const STATUS_DOT_BG: Record<AgentStatus, string> = {
  active:   'var(--accent)',
  idle:     'var(--border-2)',
  error:    'var(--error)',
  building: 'var(--warning)',
}

function AgentNodeInner({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const accentVar = LAYER_CSS_VAR[d.layer]
  const glowColor = LAYER_GLOW[d.layer]
  const isBuilding = d.status === 'building'

  return (
    <div
      style={{
        width: 180,
        borderRadius: 6,
        overflow: 'visible',
        background: selected ? 'var(--surface-3)' : 'var(--surface-1)',
        border: `1px solid ${selected ? 'var(--border-3)' : 'var(--border-1)'}`,
        transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
        cursor: 'default',
        userSelect: 'none',
        position: 'relative',
      }}
      className="group"
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = `0 0 0 1px ${accentVar.replace(')', ', 0.3)')}, 0 4px 16px ${glowColor}`
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = 'none'
      }}
    >
      {/* Layer accent bar — 3px */}
      <div
        style={{
          height: 3,
          background: accentVar,
          borderRadius: '6px 6px 0 0',
        }}
      />

      <div style={{ padding: '10px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Layer badge — top-right absolute */}
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <Badge variant={LAYER_BADGE[d.layer]} className="text-[8px] py-0">
            {d.layer}
          </Badge>
        </div>

        {/* Agent name */}
        <p style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: 40,
          marginTop: 2,
        }}>
          {d.label}
        </p>

        {/* Role */}
        <p style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {d.role}
        </p>

        {/* Model — monospace pill */}
        <span style={{
          display: 'inline-block',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          background: 'var(--surface-0)',
          border: '1px solid var(--border-1)',
          borderRadius: 3,
          padding: '1px 6px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          alignSelf: 'flex-start',
        }}>
          {d.model}
        </span>

        {/* Footer: tools badge + status dot */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 2,
        }}>
          <Badge variant="default" className="text-[9px]">
            {d.tools.length} tool{d.tools.length !== 1 ? 's' : ''}
          </Badge>

          {/* Status dot bottom-right */}
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: STATUS_DOT_BG[d.status],
              flexShrink: 0,
              animation: isBuilding ? 'pulse-subtle 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
            }}
          />
        </div>
      </div>

      {/* ReactFlow handles — lime when selected, otherwise subtle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 9,
          height: 9,
          background: selected ? 'var(--accent)' : 'var(--surface-0)',
          border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
          transition: 'border-color 150ms, background 150ms',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 9,
          height: 9,
          background: selected ? 'var(--accent)' : 'var(--surface-0)',
          border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
          transition: 'border-color 150ms, background 150ms',
        }}
      />
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
