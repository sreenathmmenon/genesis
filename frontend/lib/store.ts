import { create } from 'zustand'
import type { Edge, Node } from '@xyflow/react'
import type { AgentMessage, BuildLog } from './types'

interface GenesisStore {
  // ── Canvas ─────────────────────────────────────────────────────────────────
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null

  // ── Build state ────────────────────────────────────────────────────────────
  currentBuildId: string | null
  buildStatus: string
  isBuilding: boolean
  buildLogs: BuildLog[]

  // ── Monitor ────────────────────────────────────────────────────────────────
  agentMessages: AgentMessage[]
  tokenUsage: Record<string, number>
  estimatedCost: number

  // ── Canvas actions ─────────────────────────────────────────────────────────
  addNode: (node: Node) => void
  updateNode: (id: string, data: Partial<Node['data']>) => void
  addEdge: (edge: Edge) => void
  clearCanvas: () => void
  setSelectedNode: (id: string | null) => void

  // ── Build actions ──────────────────────────────────────────────────────────
  setCurrentBuildId: (id: string | null) => void
  setBuildStatus: (status: string) => void
  setBuilding: (building: boolean) => void
  addBuildLog: (log: BuildLog) => void
  clearBuildLogs: () => void

  // ── Monitor actions ────────────────────────────────────────────────────────
  addAgentMessage: (msg: AgentMessage) => void
  updateTokenUsage: (agent: string, tokens: number) => void
  setEstimatedCost: (cost: number) => void
  resetMonitor: () => void
}

export const useGenesisStore = create<GenesisStore>((set, get) => ({
  // ── Canvas ─────────────────────────────────────────────────────────────────
  nodes: [],
  edges: [],
  selectedNodeId: null,

  // ── Build state ────────────────────────────────────────────────────────────
  currentBuildId: null,
  buildStatus: 'idle',
  isBuilding: false,
  buildLogs: [],

  // ── Monitor ────────────────────────────────────────────────────────────────
  agentMessages: [],
  tokenUsage: {},
  estimatedCost: 0,

  // ── Canvas actions ─────────────────────────────────────────────────────────
  addNode: (node) =>
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) return s
      return { nodes: [...s.nodes, node] }
    }),

  updateNode: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    })),

  addEdge: (edge) =>
    set((s) => {
      if (s.edges.some((e) => e.id === edge.id)) return s
      return { edges: [...s.edges, edge] }
    }),

  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  // ── Build actions ──────────────────────────────────────────────────────────
  setCurrentBuildId: (id) => set({ currentBuildId: id }),

  setBuildStatus: (status) => set({ buildStatus: status }),

  setBuilding: (building) => set({ isBuilding: building }),

  addBuildLog: (log) =>
    set((s) => ({ buildLogs: [...s.buildLogs, log] })),

  clearBuildLogs: () => set({ buildLogs: [] }),

  // ── Monitor actions ────────────────────────────────────────────────────────
  addAgentMessage: (msg) =>
    set((s) => ({
      agentMessages: [...s.agentMessages.slice(-199), msg],
    })),

  updateTokenUsage: (agent, tokens) =>
    set((s) => ({
      tokenUsage: {
        ...s.tokenUsage,
        [agent]: (s.tokenUsage[agent] ?? 0) + tokens,
      },
    })),

  setEstimatedCost: (cost) => set({ estimatedCost: cost }),

  resetMonitor: () =>
    set({ agentMessages: [], tokenUsage: {}, estimatedCost: 0 }),
}))
