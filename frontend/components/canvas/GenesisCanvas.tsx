'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { AgentNode, type AgentNodeData } from './AgentNode'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
}

const EDGE_STYLE = {
  stroke: '#16A34A',
  strokeWidth: 1.5,
}

export function GenesisCanvas() {
  const storeNodes = useGenesisStore((s) => s.nodes)
  const storeEdges = useGenesisStore((s) => s.edges)
  const addStoreNode = useGenesisStore((s) => s.addNode)
  const addStoreEdge = useGenesisStore((s) => s.addEdge)
  const updateStoreNode = useGenesisStore((s) => s.updateNode)
  const setSelectedNode = useGenesisStore((s) => s.setSelectedNode)

  const fitViewRequest = useGenesisStore((s) => s.fitViewRequest)
  const registerFitView = useGenesisStore((s) => s.registerFitView)

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)

  // Sync store → ReactFlow state
  useEffect(() => { setNodes(storeNodes) }, [storeNodes, setNodes])
  useEffect(() => { setEdges(storeEdges) }, [storeEdges, setEdges])

  // Register fitView fn with store so loadWorkflow can call it directly
  useEffect(() => {
    const fitFn = () => {
      rfInstanceRef.current?.fitView({ padding: 0.15, duration: 0 })
    }
    registerFitView(fitFn)
    return () => registerFitView(() => {})
  }, [registerFitView])

  // Also respond to fitViewRequest signal (fallback when fn wasn't registered yet)
  useEffect(() => {
    if (fitViewRequest > 0 && rfInstanceRef.current) {
      setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.25, duration: 300 })
      }, 80)
    }
  }, [fitViewRequest])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => rfAddEdge({ ...connection, animated: true, style: EDGE_STYLE }, eds))
    },
    [setEdges]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  // WebSocket: live canvas updates from the build pipeline
  const { subscribe } = useWebSocket()
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)

  useEffect(() => {
    // Bulk canvas update from builder agent (canvas_json payload)
    const unsubBulk = subscribe('canvas_node_added', (payload) => {
      const p = payload as Record<string, unknown>

      // Bulk canvas_json update (sent by builder)
      if (p && typeof p === 'object' && 'canvas_json' in p) {
        const canvas = p.canvas_json as { nodes?: Node[]; edges?: Edge[] }
        clearCanvas()
        if (canvas?.nodes) canvas.nodes.forEach(addStoreNode)
        if (canvas?.edges) canvas.edges.forEach((e) =>
          addStoreEdge({ ...e, animated: true, style: EDGE_STYLE })
        )
        return
      }

      // Single node add
      addStoreNode(payload as Node)
    })

    const unsubEdge = subscribe('canvas_edge_added', (payload) => {
      const edge = payload as Edge
      addStoreEdge({ ...edge, animated: true, style: EDGE_STYLE })
    })

    const unsubUpdate = subscribe('canvas_node_updated', (payload) => {
      const { id, data } = payload as { id: string; data: Partial<AgentNodeData> }
      updateStoreNode(id, data)
    })

    return () => {
      unsubBulk()
      unsubEdge()
      unsubUpdate()
    }
  }, [subscribe, addStoreNode, addStoreEdge, updateStoreNode, clearCanvas])

  const isEmpty = nodes.length === 0

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{`
        @keyframes genesis-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .react-flow__controls {
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .react-flow__controls-button {
          background: #FFFFFF;
          border-bottom: 1px solid #F3F4F6;
          color: #6B7280;
          fill: #6B7280;
        }
        .react-flow__controls-button:hover {
          background: #F9FAFB;
          fill: #111827;
        }
        .react-flow__minimap {
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 6px;
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={(instance) => { rfInstanceRef.current = instance }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: '#F7F8FA' }}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#D1D5DB"
        />
        <MiniMap
          nodeColor="#E5E7EB"
          maskColor="rgba(247,248,250,0.8)"
          style={{ bottom: 56 }}
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      {isEmpty && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            width: 48, height: 48,
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, opacity: 0.7,
          }}>⬡</div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Canvas is empty
            </p>
            <p style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 240, lineHeight: 1.6 }}>
              Describe your agent workflow in the panel on the left to get started
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
