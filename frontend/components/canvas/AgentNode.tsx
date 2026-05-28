'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
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

const LAYER_COLORS: Record<AgentLayer, string> = {
  meta:      '#adff2f',
  build:     '#f97316',
  validate:  '#38bdf8',
  ops:       '#a78bfa',
  generated: '#adff2f',
}

const STATUS_DOT: Record<AgentStatus, { bg: string; pulse: boolean }> = {
  idle:     { bg: '#6e6e6e', pulse: false },
  active:   { bg: '#adff2f', pulse: true },
  error:    { bg: '#ff4444', pulse: false },
  building: { bg: '#f5a623', pulse: true },
}

function AgentNodeInner({ data, selected }: NodeProps) {
  const d = data as AgentNodeData
  const accent = LAYER_COLORS[d.layer]
  const dot = STATUS_DOT[d.status]

  return (
    <div
      style={{
        width: 140,
        background: selected ? '#1c1c1c' : '#111111',
        border: `1px solid ${selected ? accent : '#222222'}`,
        borderRadius: 5,
        position: 'relative',
        fontFamily: 'var(--font-syne, system-ui)',
        cursor: 'default',
        transition: 'background 150ms, border-color 150ms',
      }}
    >
      {/* Layer accent line */}
      <div
        style={{
          height: 2,
          background: accent,
          borderRadius: '5px 5px 0 0',
        }}
      />

      <div style={{ padding: '8px 10px 8px' }}>
        {/* Role badge */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {d.layer}
        </div>

        {/* Agent name */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#ededed',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            marginTop: 4,
            paddingRight: 28,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {d.label}
        </div>

        {/* Role label */}
        <div
          style={{
            fontSize: 11,
            color: '#6e6e6e',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {d.role}
        </div>

        {/* Model name */}
        <div
          style={{
            fontSize: 9,
            color: '#4a4a4a',
            marginTop: 4,
            fontFamily: 'var(--font-mono, monospace)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {d.model}
        </div>

        {/* Footer row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
          }}
        >
          {/* Tools count */}
          <span
            style={{
              fontSize: 9,
              color: '#6e6e6e',
              background: '#1c1c1c',
              border: '1px solid #222222',
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            {d.tools.length} tool{d.tools.length !== 1 ? 's' : ''}
          </span>

          {/* Status dot */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dot.bg,
              display: 'inline-block',
              flexShrink: 0,
              ...(dot.pulse
                ? { animation: 'genesis-pulse 1.5s infinite' }
                : {}),
            }}
          />
        </div>
      </div>

      {/* ReactFlow handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8,
          height: 8,
          background: '#2e2e2e',
          border: '1px solid #3a3a3a',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8,
          height: 8,
          background: '#2e2e2e',
          border: '1px solid #3a3a3a',
        }}
      />
    </div>
  )
}

export const AgentNode = memo(AgentNodeInner)
