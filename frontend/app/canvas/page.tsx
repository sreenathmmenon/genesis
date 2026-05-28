'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { GenesisCanvas } from '@/components/canvas/GenesisCanvas'
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar'
import { AgentConfigPanel } from '@/components/panels/AgentConfigPanel'
import { MonitorPanel } from '@/components/monitor/MonitorPanel'
import { IntentInput } from '@/components/panels/IntentInput'
import { useGenesisStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { Workflow } from '@/lib/types'
import type { Node, Edge } from '@xyflow/react'

function CanvasPageInner() {
  const searchParams = useSearchParams()
  const workflowId = searchParams.get('workflow_id')

  const addNode = useGenesisStore((s) => s.addNode)
  const addEdge = useGenesisStore((s) => s.addEdge)
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)

  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [intentOpen, setIntentOpen] = useState(false)

  // Load workflow from URL param
  useEffect(() => {
    if (!workflowId) return
    clearCanvas()
    api.getWorkflow(workflowId)
      .then((wf: Workflow) => {
        setWorkflow(wf)
        const canvas = wf.canvas_json as { nodes?: Node[]; edges?: Edge[] } | null
        if (canvas?.nodes) canvas.nodes.forEach(addNode)
        if (canvas?.edges) canvas.edges.forEach(addEdge)
      })
      .catch(console.error)
  }, [workflowId]) // eslint-disable-line react-hooks/exhaustive-deps

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
