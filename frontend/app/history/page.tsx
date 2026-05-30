'use client'

import { useEffect, useState } from 'react'
import { Nav } from '@/components/shared/Nav'
import { Badge, Button, EmptyState, Label } from '@/components/ui'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Message, Workflow } from '@/lib/types'

const PAGE_SIZE = 20

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function MessageCard({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)

  const typeStyles: Record<string, React.CSSProperties> = {
    state_update: { background: '#F9FAFB', borderColor: '#F3F4F6' },
    agent_output: { background: '#FFFFFF', borderColor: '#E5E7EB' },
    tool_result:  { background: '#FFFFFF', borderColor: '#E5E7EB' },
    human_input:  { background: '#F0FDF4', borderColor: '#BBF7D0' },
    tool_call:    { background: '#F9FAFB', borderColor: '#E5E7EB' },
  }

  const boxStyle = typeStyles[msg.message_type] ?? { background: '#FFFFFF', borderColor: '#E5E7EB' }

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 14px',
        borderRadius: 6,
        border: '1px solid',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 100ms',
        ...boxStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#111827',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 100,
        }}>
          {msg.sender_agent}
        </span>
        <span style={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>→</span>
        <span style={{
          fontSize: 13,
          color: '#374151',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 100,
        }}>
          {msg.receiver_agent}
        </span>
        <div style={{ flex: 1 }} />
        <Badge variant="default">{msg.message_type.replace(/_/g, ' ')}</Badge>
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: '#6B7280',
          flexShrink: 0,
        }}>
          {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false })}
        </span>
      </div>
      {msg.message_type === 'tool_call' ? (
        <pre style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: '#374151',
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 4,
          padding: '6px 10px',
          overflowX: 'auto',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'auto' : 'hidden',
          margin: 0,
        }}>
          {msg.content}
        </pre>
      ) : (
        <p style={{
          fontSize: 13,
          color: '#6B7280',
          lineHeight: 1.6,
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {msg.content}
        </p>
      )}
    </button>
  )
}

function RunRow({ run, workflowName }: { run: Run; workflowName: string }) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  async function toggleExpand() {
    if (!expanded && messages.length === 0) {
      setLoadingMsgs(true)
      try {
        const msgs = await api.getMessages(run.id) as Message[]
        setMessages(msgs)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingMsgs(false)
      }
    }
    setExpanded((e) => !e)
  }

  return (
    <div style={{ borderBottom: '1px solid #F3F4F6' }}>
      <button
        onClick={toggleExpand}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '200px 110px 1fr 80px 90px 90px 20px',
          alignItems: 'center',
          gap: 16,
          padding: '12px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'background 100ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Workflow name */}
        <span style={{
          fontSize: 14,
          color: '#111827',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}>
          {workflowName}
        </span>

        {/* Status */}
        <div style={{ display: 'flex' }}>
          <StatusBadge status={run.status} />
        </div>

        {/* Started */}
        <span style={{ fontSize: 13, color: '#374151' }}>
          {new Date(run.started_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}
        </span>

        {/* Duration */}
        <span style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: '#6B7280',
          textAlign: 'right',
        }}>
          {formatDuration(run.started_at, run.completed_at)}
        </span>

        {/* Tokens */}
        <span style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: '#6B7280',
          textAlign: 'right',
        }}>
          {run.token_count_total.toLocaleString()}
        </span>

        {/* Cost */}
        <span style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: '#111827',
          textAlign: 'right',
          fontWeight: 500,
        }}>
          ${run.estimated_cost_usd.toFixed(4)}
        </span>

        {/* Expand chevron */}
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {/* Output preview — shown collapsed */}
      {!expanded && run.error && (
        <div style={{ padding: '0 20px 10px' }}>
          <span style={{
            fontSize: 12, color: '#DC2626', fontStyle: 'italic',
            overflow: 'hidden', display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {run.error.slice(0, 120)}
          </span>
        </div>
      )}

      {expanded && (
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: '#F9FAFB',
          borderTop: '1px solid #F3F4F6',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Label>Messages</Label>
            {messages.length > 0 && (
              <Badge variant="default">{messages.length}</Badge>
            )}
          </div>
          {loadingMsgs && (
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading messages…</span>
          )}
          {!loadingMsgs && messages.length === 0 && (
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>No messages recorded for this run.</p>
          )}
          {messages.map((msg) => (
            <MessageCard key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [runsData, workflowsData] = await Promise.all([
          api.getRuns() as Promise<Run[]>,
          api.getWorkflows() as Promise<Workflow[]>,
        ])
        setRuns(runsData)
        setHasMore(runsData.length === PAGE_SIZE)

        const nameMap: Record<string, string> = {}
        for (const wf of workflowsData) {
          nameMap[wf.id] = wf.name
        }
        setWorkflowNames(nameMap)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function loadPage(newPage: number) {
    setLoading(true)
    try {
      const data = await api.getRuns() as Run[]
      setRuns(data)
      setPage(newPage)
      setHasMore(data.length === PAGE_SIZE)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function formatAgentName(name: string): string {
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  function resolveWorkflowName(workflowId: string): string {
    const raw = workflowNames[workflowId]
    return raw ? formatAgentName(raw) : workflowId.slice(0, 8) + '…'
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '40px 32px 64px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Run History
              </h1>
              {runs.length > 0 && (
                <span style={{
                  fontSize: 12,
                  color: '#6B7280',
                  background: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontWeight: 500,
                }}>
                  {runs.length} runs
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: '#6B7280' }}>All workflow executions with output and cost breakdown</p>
          </div>

          {/* Table container */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {/* Sticky table header */}
            {runs.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '200px 110px 1fr 80px 90px 90px 20px',
                gap: 16,
                padding: '10px 20px',
                borderBottom: '1px solid #E5E7EB',
                background: '#F9FAFB',
                position: 'sticky',
                top: 0,
                zIndex: 1,
                flexShrink: 0,
              }}>
                {['Workflow', 'Status', 'Started', 'Duration', 'Tokens', 'Cost', ''].map((col) => (
                  <span key={col} style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#6B7280',
                    textAlign: col === 'Duration' || col === 'Tokens' || col === 'Cost' ? 'right' : 'left',
                  }}>
                    {col}
                  </span>
                ))}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading runs…</span>
              </div>
            )}

            {!loading && runs.length === 0 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EmptyState
                  icon="📋"
                  title="No runs yet"
                  body="Run history will appear here once workflows have executed"
                />
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  workflowName={resolveWorkflowName(run.workflow_id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {runs.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '16px',
                borderTop: '1px solid #F3F4F6',
                flexShrink: 0,
                background: '#F9FAFB',
              }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => loadPage(page - 1)}
                >
                  Previous
                </Button>
                <Label style={{ marginBottom: 0 }}>Page {page + 1}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!hasMore || loading}
                  onClick={() => loadPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
