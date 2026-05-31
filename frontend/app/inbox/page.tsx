'use client'

import { useEffect, useState, useCallback } from 'react'
import { Nav } from '@/components/shared/Nav'
import { api } from '@/lib/api'
import type { Run, Workflow, Message } from '@/lib/types'

const ACRONYMS = new Set(['hn', 'ai', 'pr', 'api', 'oss', 'ml', 'ui', 'ux', 'db', 'ci', 'cd'])

function formatAgentName(name: string): string {
  return name
    .split(/[-_]/)
    .map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function extractSummary(messages: Message[]): string {
  const outputs = messages.filter(m => m.message_type === 'agent_output').reverse()
  const firstOutput = outputs[0]
  if (firstOutput) return firstOutput.content.slice(0, 200)
  const last = messages[messages.length - 1]
  return last ? last.content.slice(0, 200) : 'No output recorded.'
}

// Build a map of agentId → one-line action summary from message trace
function buildAgentSummaryMap(messages: Message[]): Record<string, string> {
  const map: Record<string, string> = {}
  // For each sender_agent, find the most informative message they sent
  for (const msg of messages) {
    const agent = msg.sender_agent
    if (!agent || agent === 'orchestrator') continue
    if (msg.message_type === 'agent_output' || msg.message_type === 'tool_result') {
      const text = msg.content.slice(0, 60).replace(/\n/g, ' ').trim()
      if (text && !map[agent]) {
        map[agent] = text
      }
    }
  }
  return map
}

// ─── Flow Diagram ─────────────────────────────────────────────────────────────

interface FlowNode {
  id: string
  label: string
  summary: string
}

interface FlowEdge {
  source: string
  target: string
}

function buildFlowGraph(
  canvasJson: Record<string, unknown> | null,
  agentSummaryMap: Record<string, string>
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!canvasJson) return { nodes: [], edges: [] }

  type RawNode = { id?: string; data?: { label?: string }; position?: { x?: number } }
  type RawEdge = { source?: string; target?: string }

  const rawNodes = (canvasJson.nodes as RawNode[] | undefined) ?? []
  const rawEdges = (canvasJson.edges as RawEdge[] | undefined) ?? []

  // Sort by x-position for left→right order
  const sorted = [...rawNodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))

  const nodes: FlowNode[] = sorted.map(n => {
    const id = n.id ?? ''
    const rawLabel = n.data?.label ?? id
    const label = formatAgentName(rawLabel)
    // Match summary by agent id or label (case-insensitive partial match)
    const summary =
      agentSummaryMap[id] ??
      agentSummaryMap[rawLabel] ??
      Object.entries(agentSummaryMap).find(([k]) =>
        k.toLowerCase().includes(id.toLowerCase()) || id.toLowerCase().includes(k.toLowerCase())
      )?.[1] ??
      ''
    return { id, label, summary }
  })

  const edges: FlowEdge[] = rawEdges
    .filter(e => e.source && e.target)
    .map(e => ({ source: e.source!, target: e.target! }))

  return { nodes, edges }
}

// Determines which nodes connect in sequence (for simple linear chains)
function toOrderedChain(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return []
  if (edges.length === 0) return nodes

  // Build adjacency: outgoing edges per node
  const outgoing: Record<string, string[]> = {}
  const hasIncoming = new Set<string>()
  for (const e of edges) {
    outgoing[e.source] = [...(outgoing[e.source] ?? []), e.target]
    hasIncoming.add(e.target)
  }

  // Find root(s) — nodes with no incoming edges
  const roots = nodes.filter(n => !hasIncoming.has(n.id))
  if (roots.length === 0) return nodes // cycle or unknown — fall back

  // BFS to get ordered list
  const visited = new Set<string>()
  const ordered: FlowNode[] = []
  const queue = [...roots]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (visited.has(cur.id)) continue
    visited.add(cur.id)
    ordered.push(cur)
    for (const next of outgoing[cur.id] ?? []) {
      const nextNode = nodes.find(n => n.id === next)
      if (nextNode && !visited.has(nextNode.id)) queue.push(nextNode)
    }
  }
  // Append any nodes not reachable from roots (parallel branches)
  for (const n of nodes) {
    if (!visited.has(n.id)) ordered.push(n)
  }
  return ordered
}

function AgentFlowDiagram({
  canvasJson,
  messages,
  succeeded,
}: {
  canvasJson: Record<string, unknown> | null
  messages: Message[]
  succeeded: boolean
}) {
  const agentSummaryMap = buildAgentSummaryMap(messages)
  const { nodes, edges } = buildFlowGraph(canvasJson, agentSummaryMap)

  if (nodes.length === 0) return null

  const ordered = toOrderedChain(nodes, edges)
  // Cap at 6 nodes for readable display; show "+N more" for extras
  const visible = ordered.slice(0, 6)
  const hidden = ordered.length - visible.length

  // Wider boxes so labels never overlap
  const BOX_W = 140
  const BOX_H = 68
  const ARROW_W = 36
  const GAP = BOX_W + ARROW_W
  const totalW = visible.length * BOX_W + (visible.length - 1) * ARROW_W + (hidden > 0 ? ARROW_W + 56 : 0) + 2

  // Arrow y-centre (accounting for 8px top offset)
  const ARROW_Y = BOX_H / 2 + 8

  return (
    <div style={{
      borderTop: '1px solid #F0F0F0',
      background: '#F8F9FA',
      padding: '16px 20px 18px',
    }}>
      {/* Section label */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#B0B7C3',
        marginBottom: 14,
      }}>
        Agent Pipeline
      </div>

      {/* Scrollable diagram container */}
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <svg
          width={Math.max(totalW, 300)}
          height={BOX_H + 20}
          style={{ display: 'block', overflow: 'visible' }}
          aria-label="Agent workflow pipeline diagram"
        >
          {/* ── Connector lines ── */}
          {visible.map((_, i) => {
            if (i === visible.length - 1 && hidden === 0) return null
            const x1 = i * GAP + BOX_W
            const x2 = x1 + ARROW_W
            const midX = (x1 + x2) / 2
            return (
              <g key={`conn-${i}`}>
                {/* Dashed line */}
                <line
                  x1={x1 + 1}
                  y1={ARROW_Y}
                  x2={x2 - 7}
                  y2={ARROW_Y}
                  stroke="#CBD5E1"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
                {/* Arrow head */}
                <polygon
                  points={`${x2 - 7},${ARROW_Y - 4} ${x2},${ARROW_Y} ${x2 - 7},${ARROW_Y + 4}`}
                  fill="#CBD5E1"
                />
                {/* Step number badge on connector */}
                <circle cx={midX} cy={ARROW_Y} r={8} fill="#EEF2FF" stroke="#C7D2FE" strokeWidth={1} />
                <text
                  x={midX}
                  y={ARROW_Y + 4}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={700}
                  fill="#6366F1"
                  fontFamily="system-ui, sans-serif"
                >
                  {i + 1}
                </text>
              </g>
            )
          })}

          {/* ── Agent boxes ── */}
          {visible.map((node, i) => {
            const x = i * GAP
            const isFirst = i === 0
            const isLast = i === visible.length - 1 && hidden === 0
            const hasSummary = node.summary.length > 0

            // Colour scheme per position
            const boxFill = isFirst ? '#EFF6FF' : isLast && succeeded ? '#F0FDF4' : '#FFFFFF'
            const boxStroke = isFirst ? '#BFDBFE' : isLast && succeeded ? '#86EFAC' : '#E2E8F0'
            const accentFill = isFirst ? '#3B82F6' : isLast && succeeded ? '#16A34A' : '#94A3B8'
            const labelColor = '#0F172A'
            const summaryColor = '#64748B'

            // Truncation lengths for the wider box
            const maxNameChars = 16
            const maxSummChars = 18

            return (
              <g key={node.id}>
                {/* Drop shadow */}
                <rect
                  x={x + 2}
                  y={12}
                  width={BOX_W}
                  height={BOX_H}
                  rx={8}
                  fill="rgba(0,0,0,0.04)"
                />
                {/* Main box */}
                <rect
                  x={x}
                  y={8}
                  width={BOX_W}
                  height={BOX_H}
                  rx={8}
                  fill={boxFill}
                  stroke={boxStroke}
                  strokeWidth={1.5}
                />
                {/* Top accent bar */}
                <rect
                  x={x}
                  y={8}
                  width={BOX_W}
                  height={4}
                  rx={8}
                  fill={accentFill}
                />
                {/* Cover bottom-left/right of top bar so only top radius shows */}
                <rect x={x} y={10} width={BOX_W} height={2} fill={accentFill} />

                {/* Agent name */}
                <text
                  x={x + BOX_W / 2}
                  y={hasSummary ? 35 : 44}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill={labelColor}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {node.label.length > maxNameChars ? node.label.slice(0, maxNameChars - 1) + '…' : node.label}
                </text>

                {/* Summary sub-label */}
                {hasSummary && (
                  <text
                    x={x + BOX_W / 2}
                    y={52}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill={summaryColor}
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {node.summary.length > maxSummChars ? node.summary.slice(0, maxSummChars - 1) + '…' : node.summary}
                  </text>
                )}

                {/* Completion checkmark on last node */}
                {isLast && succeeded && (
                  <g>
                    <circle cx={x + BOX_W - 12} cy={17} r={7} fill="#16A34A" />
                    <text x={x + BOX_W - 12} y={21} textAnchor="middle" fontSize={8} fill="#fff" fontFamily="system-ui">✓</text>
                  </g>
                )}

                {/* "Start" label on first node */}
                {isFirst && (
                  <text x={x + 10} y={20} fontSize={7} fill="#3B82F6" fontFamily="system-ui" fontWeight={700} letterSpacing="0.05em">
                    START
                  </text>
                )}
              </g>
            )
          })}

          {/* ── "+N more" overflow indicator ── */}
          {hidden > 0 && (
            <g>
              <line
                x1={visible.length * GAP - ARROW_W + 1}
                y1={ARROW_Y}
                x2={visible.length * GAP + 4}
                y2={ARROW_Y}
                stroke="#CBD5E1"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              <rect
                x={visible.length * GAP + 4}
                y={ARROW_Y - 11}
                width={44}
                height={22}
                rx={4}
                fill="#F1F5F9"
                stroke="#E2E8F0"
                strokeWidth={1}
              />
              <text
                x={visible.length * GAP + 26}
                y={ARROW_Y + 4}
                textAnchor="middle"
                fontSize={9}
                fill="#94A3B8"
                fontFamily="system-ui, sans-serif"
                fontWeight={600}
              >
                +{hidden} more
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

// ─── Inbox Card ───────────────────────────────────────────────────────────────

interface InboxItem {
  run: Run
  workflow: Workflow
  messages: Message[]
  isNew: boolean
}

function InboxCard({ item, onDismiss }: { item: InboxItem; onDismiss: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const { run, workflow, messages } = item

  const summary = extractSummary(messages)
  const succeeded = run.status === 'completed'
  const failed = run.status === 'failed'

  const statusColor = succeeded ? '#16A34A' : failed ? '#DC2626' : '#D97706'
  const statusBg = succeeded ? '#F0FDF4' : failed ? '#FEF2F2' : '#FFFBEB'
  const statusBorder = succeeded ? '#BBF7D0' : failed ? '#FECACA' : '#FDE68A'
  const statusLabel = succeeded ? 'Completed' : failed ? 'Failed' : 'Running'

  const canvasJson = workflow.canvas_json as Record<string, unknown> | null
  const canvasNodes = canvasJson ? (canvasJson as Record<string, unknown>).nodes : undefined
  const hasFlow = canvasJson && Array.isArray(canvasNodes) && (canvasNodes as unknown[]).length > 0

  return (
    <div style={{
      background: item.isNew ? '#FAFFFE' : '#FFFFFF',
      border: `1px solid ${item.isNew ? '#BBF7D0' : '#E5E7EB'}`,
      borderRadius: 8,
      overflow: 'hidden',
      transition: 'box-shadow 150ms',
      boxShadow: item.isNew
        ? '0 2px 8px rgba(22,163,74,0.08)'
        : '0 1px 3px rgba(0,0,0,0.06)',
    }}>

      {/* Card header — always visible */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: statusBg, border: `1px solid ${statusBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2, fontSize: 16,
        }}>
          {succeeded ? '✓' : failed ? '✕' : '⟳'}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {formatAgentName(workflow.name)}
            </span>
            {item.isNew && (
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 3, padding: '1px 6px',
              }}>New</span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 11, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
              borderRadius: 4, padding: '2px 8px', fontWeight: 500,
            }}>{statusLabel}</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{relativeTime(run.started_at)}</span>
          </div>

          {/* Output summary */}
          <p style={{
            fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
          }}>
            {summary || workflow.intent || 'Agent completed its run.'}
          </p>
        </div>

        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginTop: 6 }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* ── FLOW DIAGRAM — always shown (collapsed state) ── */}
      {hasFlow && (
        <AgentFlowDiagram
          canvasJson={canvasJson}
          messages={messages}
          succeeded={succeeded}
        />
      )}

      {/* ── EXPANDED: message trace ── */}
      {expanded && messages.length > 0 && (
        <div style={{
          borderTop: '1px solid #F3F4F6',
          background: '#F9FAFB',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4,
          }}>
            Message trace · {messages.length} messages
          </div>
          {messages.slice(0, 10).map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 10, color: '#9CA3AF', fontFamily: 'var(--font-mono)',
                flexShrink: 0, marginTop: 3, minWidth: 52,
              }}>
                {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500, color: '#6B7280',
                background: '#E5E7EB', borderRadius: 3, padding: '1px 5px',
                flexShrink: 0, fontFamily: 'var(--font-mono)', marginTop: 2,
                maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {msg.sender_agent}
              </span>
              <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                {msg.content.slice(0, 200)}{msg.content.length > 200 ? '…' : ''}
              </span>
            </div>
          ))}
          {messages.length > 10 && (
            <span style={{ fontSize: 12, color: '#9CA3AF', paddingLeft: 62 }}>
              + {messages.length - 10} more messages
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #F3F4F6', padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 8, background: '#FAFAFA',
      }}>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          ${run.estimated_cost_usd.toFixed(4)} · {run.token_count_total.toLocaleString()} tokens
        </span>
        <div style={{ flex: 1 }} />
        {failed && run.error && (
          <span style={{
            fontSize: 11, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 4, padding: '2px 8px', maxWidth: 260,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {run.error.slice(0, 80)}
          </span>
        )}
        <button
          onClick={() => onDismiss(run.id)}
          style={{
            fontSize: 12, color: '#9CA3AF', background: 'transparent',
            border: '1px solid #E5E7EB', borderRadius: 4, padding: '4px 10px',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 120ms',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#374151'; el.style.borderColor = '#D1D5DB' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#9CA3AF'; el.style.borderColor = '#E5E7EB' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const seenKey = 'genesis_inbox_seen'

  useEffect(() => {
    async function load() {
      try {
        const [runsRaw, workflowsRaw] = await Promise.all([
          api.getRuns() as Promise<Run[]>,
          api.getWorkflows() as Promise<Workflow[]>,
        ])
        const wfMap: Record<string, Workflow> = {}
        for (const wf of workflowsRaw) wfMap[wf.id] = wf

        const seen: string[] = JSON.parse(localStorage.getItem(seenKey) ?? '[]')
        const seenSet = new Set(seen)
        const recentRuns = runsRaw.slice(0, 10)

        const withMessages = await Promise.all(
          recentRuns.map(async (run) => {
            const wf = wfMap[run.workflow_id]
            if (!wf) return null
            let messages: Message[] = []
            try { messages = await api.getMessages(run.id) as Message[] } catch {}
            return { run, workflow: wf, messages, isNew: !seenSet.has(run.id) } satisfies InboxItem
          })
        )

        setItems(withMessages.filter((x): x is InboxItem => x !== null))
        const allIds = recentRuns.map(r => r.id)
        localStorage.setItem(seenKey, JSON.stringify([...new Set([...seen, ...allIds])]))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleDismiss = useCallback((runId: string) => {
    setDismissed(prev => new Set([...prev, runId]))
  }, [])

  const visibleItems = items.filter(i => !dismissed.has(i.run.id))
  const newCount = visibleItems.filter(i => i.isNew).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content" style={{ paddingLeft: 220, flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", background: "#F6F8FC" }}>
        <div style={{ maxWidth: 800, width: '100%', margin: '0 auto', padding: '40px 32px 64px', overflowY: 'auto', height: '100%' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Inbox
              </h1>
              {newCount > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#16A34A',
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 10, padding: '2px 8px',
                }}>
                  {newCount} new
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              Your agents' completed work — see what each agent did and review the output
            </p>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading inbox…</span>
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div style={{
              background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '64px 32px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 24,
              }}>✓</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 6 }}>All caught up</p>
              <p style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 300, margin: '0 auto' }}>
                Your agents haven't run yet, or you've reviewed everything.
              </p>
            </div>
          )}

          {!loading && visibleItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleItems.filter(i => i.isNew).length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4 }}>
                    New
                  </div>
                  {visibleItems.filter(i => i.isNew).map(item => (
                    <InboxCard key={item.run.id} item={item} onDismiss={handleDismiss} />
                  ))}
                </>
              )}
              {visibleItems.filter(i => !i.isNew).length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4, marginTop: 8 }}>
                    Earlier
                  </div>
                  {visibleItems.filter(i => !i.isNew).map(item => (
                    <InboxCard key={item.run.id} item={item} onDismiss={handleDismiss} />
                  ))}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
