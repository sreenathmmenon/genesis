'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
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

const STARTER_PROMPTS = [
  'Every morning, research the top 5 news stories in my industry, write a 3-sentence brief for each, and save them to my results dashboard',
  'When I give you a company name, research their products, pricing, recent news, and key people — then write a detailed competitive analysis',
  'Every week, find 10 trending topics in AI startups, score each by relevance to B2B SaaS, and give me a ranked list with 1-line summaries',
  'Research the best coffee shops in Bangalore with free WiFi and quiet seating, then rank them by distance from Koramangala and write a comparison',
]

function InlineIntentPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const [intent, setIntent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedPrompt, setFocusedPrompt] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const setBuilding = useGenesisStore(s => s.setBuilding)
  const setCurrentBuildId = useGenesisStore(s => s.setCurrentBuildId)
  const setBuildStatus = useGenesisStore(s => s.setBuildStatus)

  async function handleBuild() {
    if (intent.trim().length < 10) { setError('Describe what you want your agent to do'); return }
    setLoading(true)
    try {
      const build = await api.startBuild(intent.trim()) as { build_id: string }
      setCurrentBuildId(build.build_id)
      setBuilding(true)
      setBuildStatus('decomposing')
      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setLoading(false)
    }
  }

  function usePrompt(prompt: string) {
    setIntent(prompt)
    setError('')
    textareaRef.current?.focus()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid #EEF0F4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#16A34A', fontWeight: 700, fontFamily: 'var(--font-mono)',
          }}>G</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.01em' }}>
            Build an agent
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6, margin: 0 }}>
          Describe a task in plain English. Genesis designs and deploys a multi-agent workflow that runs it autonomously.
        </p>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={intent}
          onChange={e => { setIntent(e.target.value); setError('') }}
          placeholder="e.g. Every morning, review our open PRs, find any that touch the payments service, and post a risk summary to our Slack engineering channel."
          rows={6}
          style={{
            width: '100%',
            background: '#FFFFFF',
            border: `1px solid ${error ? '#FCA5A5' : '#E2E8F0'}`,
            borderRadius: 8,
            padding: '10px 12px',
            color: '#0F172A',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.65,
            resize: 'none',
            outline: 'none',
            transition: 'border-color 150ms, box-shadow 150ms',
            boxShadow: 'none',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#16A34A'
            e.target.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'
          }}
          onBlur={e => {
            e.target.style.borderColor = error ? '#FCA5A5' : '#E2E8F0'
            e.target.style.boxShadow = 'none'
          }}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleBuild() }}
        />
        {error && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: '#DC2626',
            lineHeight: 1.5,
            marginTop: -4,
          }}>
            {error}
          </div>
        )}

        {/* Build button */}
        <button
          onClick={handleBuild}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 0',
            background: loading ? '#F1F5F9' : '#16A34A',
            color: loading ? '#94A3B8' : '#FFFFFF',
            border: '1px solid',
            borderColor: loading ? '#E2E8F0' : 'transparent',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'all 150ms',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#15803D' }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#16A34A' }}
        >
          {loading ? (
            <>
              <span style={{
                width: 12, height: 12,
                border: '2px solid rgba(0,0,0,0.1)',
                borderTopColor: '#94A3B8',
                borderRadius: '50%',
                animation: 'spin 600ms linear infinite',
                display: 'inline-block', flexShrink: 0,
              }} />
              Building your agent team…
            </>
          ) : 'Build with Genesis'}
        </button>

        <p style={{ fontSize: 11, color: '#B0B7C3', textAlign: 'center', margin: '-4px 0 0' }}>
          ⌘ + Enter · Takes 20–60 seconds
        </p>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: '#EEF0F4' }} />
          <span style={{ fontSize: 10, color: '#CBD5E1', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Or try an example
          </span>
          <div style={{ flex: 1, height: 1, background: '#EEF0F4' }} />
        </div>

        {/* Starter prompts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STARTER_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => usePrompt(prompt)}
              onMouseEnter={() => setFocusedPrompt(i)}
              onMouseLeave={() => setFocusedPrompt(null)}
              style={{
                textAlign: 'left',
                background: focusedPrompt === i ? '#F8FAFD' : '#FFFFFF',
                border: `1px solid ${focusedPrompt === i ? '#CBD5E1' : '#EEF0F4'}`,
                borderRadius: 7,
                padding: '9px 12px',
                fontSize: 12,
                color: '#374151',
                lineHeight: 1.55,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 120ms',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <span style={{ color: '#CBD5E1', flexShrink: 0, marginTop: 1 }}>↗</span>
              {prompt}
            </button>
          ))}
        </div>

      </div>
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
  const requestFitView = useGenesisStore((s) => s.requestFitView)

  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [intentOpen, setIntentOpen] = useState(false)
  const [autoLoadedId, setAutoLoadedId] = useState<string | null>(null)

  const { subscribe } = useWebSocket()

  const loadWorkflow = useCallback((id: string) => {
    clearCanvas()
    api.getWorkflow(id)
      .then((wf: Workflow) => {
        setWorkflow(wf)
        const canvas = wf.canvas_json as { nodes?: Node[]; edges?: Edge[] } | null
        if (canvas?.nodes) canvas.nodes.forEach(addNode)
        if (canvas?.edges) canvas.edges.forEach((e) => addEdge({ ...e, animated: true, style: EDGE_STYLE }))
        // Delay fitView so ReactFlow has time to render nodes
        setTimeout(() => requestFitView(), 300)
      })
      .catch(console.error)
  }, [clearCanvas, addNode, addEdge, requestFitView])

  // Load workflow from URL param on mount
  useEffect(() => {
    if (!workflowId) return
    loadWorkflow(workflowId)
  }, [workflowId, loadWorkflow])

  // When landing on /canvas with no workflow_id, load the most recent workflow
  // as a *preview only* — so the canvas isn't empty — but keep the build panel
  // front-and-center and DON'T rewrite the URL. That way a first-time visitor
  // always sees "Build an agent" as the primary action instead of mistaking a
  // pre-existing graph for their own workflow.
  useEffect(() => {
    if (workflowId) return
    api.getWorkflows().then((wfs) => {
      const active = (wfs as Workflow[])
        .filter(w => w.status === 'active' || w.status === 'paused')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const wf = active[0]
      if (wf) {
        setAutoLoadedId(wf.id)
        loadWorkflow(wf.id)
        // Intentionally NOT calling router.replace — the URL stays clean at
        // /canvas so the build panel remains the primary experience.
      }
    }).catch(console.error)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Left: 280px — show the build prompt as the primary action whenever
            the user hasn't explicitly opened a workflow via URL. A preview
            graph may still be auto-loaded on the canvas, but "Build an agent"
            stays front-and-center so new visitors always know where to start. */}
        <aside className="layout-left">
          {!workflowId ? (
            <InlineIntentPanel onSubmitted={() => { setWorkflow(null); setAutoLoadedId(null) }} />
          ) : (
            <AgentConfigPanel workflow={workflow} />
          )}
        </aside>

        {/* Center: flex-1, ReactFlow canvas */}
        <main className="layout-center" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Example banner — shown only when a preview graph is auto-loaded
              (no explicit workflow_id). Makes clear the graph isn't the user's. */}
          {!workflowId && autoLoadedId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', background: '#F8FAFD',
              borderBottom: '1px solid #EEF0F4', flexShrink: 0,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 5, padding: '2px 7px',
              }}>Example</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                This is a sample workflow. Describe your own task on the left to build a new agent.
              </span>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, height: '100%' }}>
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
