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
    state_update: { background: 'var(--surface-0)', borderColor: 'var(--border-0)' },
    agent_output: { background: 'var(--surface-1)', borderColor: 'var(--border-1)' },
    tool_result:  { background: 'var(--surface-1)', borderColor: 'var(--border-1)' },
    human_input:  { background: 'var(--accent-dim)', borderColor: 'var(--accent-border)' },
    tool_call:    { background: 'var(--surface-2)', borderColor: 'var(--border-2)' },
  }

  const boxStyle = typeStyles[msg.message_type] ?? { background: 'var(--surface-1)', borderColor: 'var(--border-1)' }

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
        borderRadius: 5,
        border: '1px solid',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 100ms',
        ...boxStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 100,
        }}>
          {msg.sender_agent}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>→</span>
        <span style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
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
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}>
          {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false })}
        </span>
      </div>
      {msg.message_type === 'tool_call' ? (
        <pre style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          background: 'var(--surface-0)',
          border: '1px solid var(--border-1)',
          borderRadius: 3,
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
          fontSize: 11,
          color: 'var(--text-tertiary)',
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
    <div style={{ borderBottom: '1px solid var(--border-0)' }}>
      <button
        onClick={toggleExpand}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '200px 100px 1fr 80px 90px 90px 20px',
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
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Workflow name */}
        <span style={{
          fontSize: 13,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workflowName}
        </span>

        {/* Status */}
        <div style={{ display: 'flex' }}>
          <StatusBadge status={run.status} />
        </div>

        {/* Started */}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {new Date(run.started_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}
        </span>

        {/* Duration */}
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          textAlign: 'right',
        }}>
          {formatDuration(run.started_at, run.completed_at)}
        </span>

        {/* Tokens */}
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          textAlign: 'right',
        }}>
          {run.token_count_total.toLocaleString()}
        </span>

        {/* Cost */}
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent-text)',
          textAlign: 'right',
        }}>
          ${run.estimated_cost_usd.toFixed(4)}
        </span>

        {/* Expand chevron */}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {expanded && (
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--surface-0)',
          borderTop: '1px solid var(--border-0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Label>Messages</Label>
            {messages.length > 0 && (
              <Badge variant="default">{messages.length}</Badge>
            )}
          </div>
          {loadingMsgs && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading messages…</span>
          )}
          {!loadingMsgs && messages.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No messages recorded for this run.</p>
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

  function resolveWorkflowName(workflowId: string): string {
    return workflowNames[workflowId] ?? workflowId.slice(0, 8) + '…'
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '40px 32px 64px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Run History
              </h1>
              {runs.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface-2)', border: '1px solid var(--border-1)', borderRadius: 3, padding: '2px 7px' }}>
                  {runs.length} runs
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>All workflow executions with output and cost breakdown</p>
          </div>

          {/* Table container */}
          <div style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-1)',
            borderRadius: 5,
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Sticky table header */}
            {runs.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '200px 100px 1fr 80px 90px 90px 20px',
                gap: 16,
                padding: '10px 20px',
                borderBottom: '1px solid var(--border-1)',
                background: 'var(--surface-1)',
                position: 'sticky',
                top: 0,
                zIndex: 1,
                flexShrink: 0,
              }}>
                {['Workflow', 'Status', 'Started', 'Duration', 'Tokens', 'Cost', ''].map((col) => (
                  <span key={col} style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    textAlign: col === 'Duration' || col === 'Tokens' || col === 'Cost' ? 'right' : 'left',
                  }}>
                    {col}
                  </span>
                ))}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading runs…</span>
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
                borderTop: '1px solid var(--border-0)',
                flexShrink: 0,
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
