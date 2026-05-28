'use client'

import { useGenesisStore } from '@/lib/store'
import { GenesisCanvas } from '@/components/canvas/GenesisCanvas'
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar'
import { AgentConfigPanel } from '@/components/panels/AgentConfigPanel'
import { MonitorPanel } from '@/components/monitor/MonitorPanel'

const PANEL_STYLE: React.CSSProperties = {
  background: '#111111',
  borderRight: '1px solid #1a1a1a',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
}

export default function CanvasPage() {
  const selectedNodeId = useGenesisStore((s) => s.selectedNodeId)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#0a0a0a',
      }}
    >
      {/* Top toolbar */}
      <div
        style={{
          height: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          background: '#111111',
          borderBottom: '1px solid #1a1a1a',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 700,
            fontSize: 14,
            color: '#ededed',
            letterSpacing: '-0.01em',
          }}
        >
          Genesis
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: '#adff2f',
            border: '1px solid #3a5500',
            background: '#1a2400',
            borderRadius: 3,
            padding: '2px 6px',
            letterSpacing: '0.04em',
          }}
        >
          CANVAS
        </span>
      </div>

      {/* Three-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Agent config (280px) */}
        <div style={{ ...PANEL_STYLE, width: 280 }}>
          <AgentConfigPanel />
        </div>

        {/* Centre: Canvas + toolbar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <CanvasToolbar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <GenesisCanvas />
          </div>
        </div>

        {/* Right: Monitor (320px) */}
        <div
          style={{
            ...PANEL_STYLE,
            width: 320,
            borderRight: 'none',
            borderLeft: '1px solid #1a1a1a',
          }}
        >
          <MonitorPanel />
        </div>
      </div>
    </div>
  )
}
