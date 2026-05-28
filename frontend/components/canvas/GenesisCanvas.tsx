'use client'

import { useCallback, useEffect } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { AgentNode, type AgentNodeData } from './AgentNode'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
}

const EDGE_STYLE = {
  stroke: '#adff2f',
  strokeWidth: 1.5,
}

export function GenesisCanvas() {
  const storeNodes = useGenesisStore((s) => s.nodes)
  const storeEdges = useGenesisStore((s) => s.edges)
  const addStoreNode = useGenesisStore((s) => s.addNode)
  const addStoreEdge = useGenesisStore((s) => s.addEdge)
  const updateStoreNode = useGenesisStore((s) => s.updateNode)
  const setSelectedNode = useGenesisStore((s) => s.setSelectedNode)

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges)

  // Sync store → ReactFlow state
  useEffect(() => { setNodes(storeNodes) }, [storeNodes, setNodes])
  useEffect(() => { setEdges(storeEdges) }, [storeEdges, setEdges])

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

  useEffect(() => {
    const unsubNode = subscribe('canvas_node_added', (payload) => {
      addStoreNode(payload as Node)
    })

    const unsubEdge = subscribe('canvas_edge_added', (payload) => {
      const edge = payload as Edge
      addStoreEdge({
        ...edge,
        animated: true,
        style: EDGE_STYLE,
      })
    })

    const unsubUpdate = subscribe('canvas_node_updated', (payload) => {
      const { id, data } = payload as { id: string; data: Partial<AgentNodeData> }
      updateStoreNode(id, data)
    })

    return () => {
      unsubNode()
      unsubEdge()
      unsubUpdate()
    }
  }, [subscribe, addStoreNode, addStoreEdge, updateStoreNode])

  const isEmpty = nodes.length === 0

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{`
        @keyframes genesis-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .react-flow__controls {
          background: #111111;
          border: 1px solid #222222;
          border-radius: 5px;
          box-shadow: none;
        }
        .react-flow__controls-button {
          background: #111111;
          border-bottom: 1px solid #222222;
          color: #6e6e6e;
          fill: #6e6e6e;
        }
        .react-flow__controls-button:hover {
          background: #1c1c1c;
          fill: #ededed;
        }
        .react-flow__minimap {
          background: #111111;
          border: 1px solid #222222;
          border-radius: 5px;
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
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: '#0a0a0a' }}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1a1a"
        />
        <MiniMap
          nodeColor="#222222"
          maskColor="rgba(10,10,10,0.8)"
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
            gap: 12,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 32, opacity: 0.15 }}>⬡</div>
          <p
            style={{
              fontSize: 13,
              color: '#6e6e6e',
              fontStyle: 'italic',
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 1.6,
            }}
          >
            Send an intent to your Telegram bot to start building
          </p>
        </div>
      )}
    </div>
  )
}
