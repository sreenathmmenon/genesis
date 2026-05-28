'use client'

import { useGenesisStore } from '@/lib/store'

const STATUS_COLORS: Record<string, string> = {
  idle:       'var(--color-text-tertiary, #6e6e6e)',
  decomposing: 'var(--color-warning, #f5a623)',
  building:   'var(--color-warning, #f5a623)',
  critiquing: 'var(--color-info, #3b9edd)',
  validating: 'var(--color-info, #3b9edd)',
  awaiting_approval: 'var(--color-accent, #adff2f)',
  deployed:   'var(--color-accent, #adff2f)',
  failed:     'var(--color-error, #ff4444)',
}

export function CanvasToolbar() {
  const buildStatus = useGenesisStore((s) => s.buildStatus)
  const isBuilding = useGenesisStore((s) => s.isBuilding)
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)
  const nodeCount = useGenesisStore((s) => s.nodes.length)
  const edgeCount = useGenesisStore((s) => s.edges.length)

  const dotColor = STATUS_COLORS[buildStatus] ?? '#6e6e6e'

  return (
    <div
      style={{
        height: 40,
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        background: '#111111',
        borderBottom: '1px solid #1a1a1a',
        gap: 16,
        flexShrink: 0,
      }}
    >
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
            animation: isBuilding ? 'genesis-pulse 1.5s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: '#6e6e6e',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 500,
          }}
        >
          {buildStatus}
        </span>
      </div>

      <div
        style={{
          width: 1,
          height: 16,
          background: '#1a1a1a',
        }}
      />

      {/* Graph stats */}
      <span style={{ fontSize: 11, color: '#6e6e6e' }}>
        {nodeCount} agents · {edgeCount} edges
      </span>

      <div style={{ flex: 1 }} />

      {/* Clear button */}
      {nodeCount > 0 && (
        <button
          onClick={clearCanvas}
          style={{
            background: 'transparent',
            border: '1px solid #222222',
            borderRadius: 5,
            padding: '3px 10px',
            fontSize: 11,
            color: '#6e6e6e',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#ededed'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e2e'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#6e6e6e'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#222222'
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
