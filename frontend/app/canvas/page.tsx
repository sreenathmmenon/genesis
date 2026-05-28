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

const EDGE_STYLE = { stroke: '#adff2f', strokeWidth: 1.5 }

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

        {/* Left: 280px, agent config */}
        <aside className="layout-left">
          <AgentConfigPanel />
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
