'use client'

import { useEffect, useState, useCallback } from 'react'
import { Nav } from '@/components/shared/Nav'
import { api } from '@/lib/api'
import type { Run, Workflow, Message } from '@/lib/types'

const ACRONYMS = new Set(['hn', 'ai', 'pr', 'api', 'oss', 'ml', 'ui', 'ux', 'db', 'ci', 'cd'])

function formatAgentName(name: string): string {
  return name
    .split('-')
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
  // Find the last agent_output message — that's the work product
  const outputs = messages.filter(m => m.message_type === 'agent_output').reverse()
  const firstOutput = outputs[0]
  if (firstOutput) return firstOutput.content.slice(0, 200)
  const last = messages[messages.length - 1]
  return last ? last.content.slice(0, 200) : 'No output recorded.'
}

function extractActions(messages: Message[]): string[] {
  // Find tool_call messages to show what the agent actually did
  return messages
    .filter(m => m.message_type === 'tool_call')
    .slice(0, 3)
    .map(m => {
      try {
        const parsed = JSON.parse(m.content)
        return parsed.tool_name ?? parsed.name ?? m.content.slice(0, 60)
      } catch {
        return m.content.slice(0, 60)
      }
    })
}

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
  const actions = extractActions(messages)
  const succeeded = run.status === 'completed'
  const failed = run.status === 'failed'

  const statusColor = succeeded ? '#16A34A' : failed ? '#DC2626' : '#D97706'
  const statusBg = succeeded ? '#F0FDF4' : failed ? '#FEF2F2' : '#FFFBEB'
  const statusBorder = succeeded ? '#BBF7D0' : failed ? '#FECACA' : '#FDE68A'
  const statusLabel = succeeded ? 'Completed' : failed ? 'Failed' : 'Running'

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
      {/* Card header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: '16px 20px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status icon */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: statusBg,
          border: `1px solid ${statusBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}>
          <span style={{ fontSize: 16 }}>
            {succeeded ? '✓' : failed ? '✕' : '⟳'}
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              {formatAgentName(workflow.name)}
            </span>
            {item.isNew && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#16A34A',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 3,
                padding: '1px 6px',
              }}>New</span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 11,
              background: statusBg,
              color: statusColor,
              border: `1px solid ${statusBorder}`,
              borderRadius: 4,
              padding: '2px 8px',
              fontWeight: 500,
            }}>{statusLabel}</span>
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>{relativeTime(run.started_at)}</span>
          </div>

          {/* Summary text */}
          <p style={{
            fontSize: 13,
            color: '#374151',
            lineHeight: 1.6,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
          }}>
            {summary || workflow.intent || 'Agent completed its run.'}
          </p>

          {/* Tool actions taken */}
          {actions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {actions.map((action, i) => (
                <span key={i} style={{
                  fontSize: 11,
                  color: '#6B7280',
                  background: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {action}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginTop: 6 }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && messages.length > 0 && (
        <div style={{
          borderTop: '1px solid #F3F4F6',
          background: '#F9FAFB',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4 }}>
            Agent trace ({messages.length} messages)
          </div>
          {messages.slice(0, 8).map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
              <span style={{
                fontSize: 10,
                color: '#9CA3AF',
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
                marginTop: 3,
                minWidth: 52,
              }}>
                {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                color: '#6B7280',
                background: '#E5E7EB',
                borderRadius: 3,
                padding: '1px 5px',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                marginTop: 2,
                maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {msg.sender_agent}
              </span>
              <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                {msg.content.slice(0, 180)}{msg.content.length > 180 ? '…' : ''}
              </span>
            </div>
          ))}
          {messages.length > 8 && (
            <span style={{ fontSize: 12, color: '#9CA3AF', paddingLeft: 62 }}>
              + {messages.length - 8} more messages
            </span>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div style={{
        borderTop: '1px solid #F3F4F6',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#FAFAFA',
      }}>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          ${run.estimated_cost_usd.toFixed(4)} · {run.token_count_total.toLocaleString()} tokens
        </span>
        <div style={{ flex: 1 }} />
        {failed && run.error && (
          <span style={{
            fontSize: 11,
            color: '#DC2626',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 4,
            padding: '2px 8px',
            maxWidth: 260,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {run.error.slice(0, 80)}
          </span>
        )}
        <button
          onClick={() => onDismiss(run.id)}
          style={{
            fontSize: 12,
            color: '#9CA3AF',
            background: 'transparent',
            border: '1px solid #E5E7EB',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 120ms',
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

        // Load messages for recent runs (up to 10)
        const recentRuns = runsRaw.slice(0, 10)
        const withMessages = await Promise.all(
          recentRuns.map(async (run) => {
            const wf = wfMap[run.workflow_id]
            if (!wf) return null
            let messages: Message[] = []
            try {
              messages = await api.getMessages(run.id) as Message[]
            } catch {}
            return {
              run,
              workflow: wf,
              messages,
              isNew: !seenSet.has(run.id),
            } satisfies InboxItem
          })
        )

        const valid = withMessages.filter((x): x is InboxItem => x !== null)
        setItems(valid)

        // Mark all as seen
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

      <div className="page-content">
        <div style={{ maxWidth: 780, width: '100%', margin: '0 auto', padding: '40px 32px 64px', overflowY: 'auto', height: '100%' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Inbox
              </h1>
              {newCount > 0 && (
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#16A34A',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: 10,
                  padding: '2px 8px',
                  minWidth: 20,
                  textAlign: 'center',
                }}>
                  {newCount} new
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              Your agents' completed work — review what they did while you were away
            </p>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading inbox…</span>
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '64px 32px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 24,
              }}>✓</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                All caught up
              </p>
              <p style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 300, margin: '0 auto' }}>
                Your agents haven't run yet, or you've reviewed everything. New work will appear here automatically.
              </p>
            </div>
          )}

          {!loading && visibleItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* New items first */}
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
