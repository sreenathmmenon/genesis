'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { GenesisCanvas } from '@/components/canvas/GenesisCanvas'
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar'
import { AgentConfigPanel } from '@/components/panels/AgentConfigPanel'
import { MonitorPanel } from '@/components/monitor/MonitorPanel'
import { IntentInput } from '@/components/panels/IntentInput'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'
import { api } from '@/lib/api'
import type { Workflow } from '@/lib/types'
import type { Node, Edge } from '@xyflow/react'

function InlineIntentPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const [intent, setIntent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setBuilding = useGenesisStore(s => s.setBuilding)
  const setCurrentBuildId = useGenesisStore(s => s.setCurrentBuildId)
  const setBuildStatus = useGenesisStore(s => s.setBuildStatus)

  async function handleBuild() {
    if (intent.trim().length < 10) { setError('Describe what you want to build'); return }
    setLoading(true)
    try {
      const build = await api.startBuild(intent.trim()) as { id: string }
      setCurrentBuildId(build.id)
      setBuilding(true)
      setBuildStatus('decomposing')
      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
          What do you want to build?
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
          Describe your agent workflow in plain English
        </div>
      </div>
      <textarea
        value={intent}
        onChange={e => { setIntent(e.target.value); setError('') }}
        placeholder="Monitor our GitHub repo and send me a Telegram alert when a PR hasn't been reviewed in 24 hours..."
        rows={7}
        style={{
          width: '100%',
          background: '#FFFFFF',
          border: '1px solid #D1D5DB',
          borderRadius: 6,
          padding: '10px 12px',
          color: '#111827',
          fontSize: 14,
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.6,
          resize: 'none',
          outline: 'none',
          boxShadow: 'none',
          transition: 'border-color 150ms, box-shadow 150ms',
        }}
        onFocus={e => { e.target.style.borderColor = '#16A34A'; e.target.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)' }}
        onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none' }}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleBuild() }}
      />
      {error && <p style={{ fontSize: 13, color: '#DC2626' }}>{error}</p>}
      <button
        onClick={handleBuild}
        disabled={loading}
        style={{
          padding: '10px 0',
          background: loading ? '#F9FAFB' : '#16A34A',
          color: loading ? '#9CA3AF' : '#FFFFFF',
          border: '1px solid',
          borderColor: loading ? '#E5E7EB' : 'transparent',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'all 150ms',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => { if (!loading) { const el = e.currentTarget as HTMLElement; el.style.background = '#15803D' } }}
        onMouseLeave={e => { if (!loading) { const el = e.currentTarget as HTMLElement; el.style.background = '#16A34A' } }}
      >
        {loading ? 'Building…' : 'Build with Genesis'}
      </button>
      <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
        ⌘ + Enter to submit
      </p>
    </div>
  )
}

const EDGE_STYLE = { stroke: '#16A34A', strokeWidth: 1.5 }

function CanvasPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const workflowId = searchParams.get('workflow_id')

  const addNode = useGenesisStore((s) => s.addNode)
  const addEdge = useGenesisStore((s) => s.addEdge)
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)
  const setBuildStatus = useGenesisStore((s) => s.setBuildStatus)
  const setBuilding = useGenesisStore((s) => s.setBuilding)

  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [intentOpen, setIntentOpen] = useState(false)

  const { subscribe } = useWebSocket()

  const loadWorkflow = useCallback((id: string) => {
    clearCanvas()
    api.getWorkflow(id)
      .then((wf: Workflow) => {
        setWorkflow(wf)
        const canvas = wf.canvas_json as { nodes?: Node[]; edges?: Edge[] } | null
        if (canvas?.nodes) canvas.nodes.forEach(addNode)
        if (canvas?.edges) canvas.edges.forEach((e) => addEdge({ ...e, animated: true, style: EDGE_STYLE }))
      })
      .catch(console.error)
  }, [clearCanvas, addNode, addEdge])

  // Load workflow from URL param on mount
  useEffect(() => {
    if (!workflowId) return
    loadWorkflow(workflowId)
  }, [workflowId, loadWorkflow])

  // Listen for deploy event → navigate canvas to the new workflow
  useEffect(() => {
    const unsub = subscribe('build_progress', (payload) => {
      const p = payload as Record<string, unknown>
      if (p?.action === 'deployed' && typeof p?.workflow_id === 'string') {
        setBuildStatus('deployed')
        setBuilding(false)
        // Navigate so URL reflects the workflow, then load canvas
        router.replace(`/canvas?workflow_id=${p.workflow_id}`)
      }
    })
    return unsub
  }, [subscribe, router, setBuildStatus, setBuilding])

  return (
    <div className="layout-root">

      {/* Toolbar — uses layout-toolbar primitive */}
      <CanvasToolbar
        workflowName={workflow?.name}
        onNewBuild={() => setIntentOpen(true)}
      />

      {/* Three-panel body — uses layout-body + layout-left + layout-center + layout-right */}
      <div className="layout-body">

        {/* Left: 280px, agent config or inline build prompt */}
        <aside className="layout-left">
          {!workflowId ? (
            <InlineIntentPanel onSubmitted={() => setWorkflow(null)} />
          ) : (
            <AgentConfigPanel />
          )}
        </aside>

        {/* Center: flex-1, ReactFlow canvas */}
        <main className="layout-center flex flex-col">
          <div className="flex-1 overflow-hidden">
            <GenesisCanvas />
          </div>
        </main>

        {/* Right: 300px, monitor panel */}
        <aside className="layout-right">
          <MonitorPanel />
        </aside>

      </div>

      {/* Intent input modal */}
      {intentOpen && (
        <IntentInput onClose={() => setIntentOpen(false)} />
      )}

    </div>
  )
}

export default function CanvasPage() {
  return (
    <Suspense>
      <CanvasPageInner />
    </Suspense>
  )
}
