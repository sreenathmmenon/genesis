'use client'

import { useEffect, useState } from 'react'
import {
  Badge, Button, EmptyState, Label,
} from '@/components/ui'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Message } from '@/lib/types'

const PAGE_SIZE = 20

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function MessageRow({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)

  const bgStyle: React.CSSProperties = {
    state_update: { background: 'var(--surface-0)', borderColor: 'var(--border-0)' },
    agent_output: { background: 'var(--surface-1)', borderColor: 'var(--border-1)' },
    tool_result:  { background: 'var(--surface-1)', borderColor: 'var(--border-1)' },
    human_input:  { background: 'var(--accent-dim)', borderColor: 'var(--accent-border)' },
    tool_call:    { background: 'var(--surface-2)', borderColor: 'var(--border-2)' },
  }[msg.message_type] ?? { background: 'var(--surface-1)', borderColor: 'var(--border-1)' }

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 4,
        border: '1px solid',
        cursor: 'pointer',
        fontFamily: 'inherit',
        ...bgStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
          {msg.sender_agent}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>→</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
          {msg.receiver_agent}
        </span>
        <div style={{ flex: 1 }} />
        <Badge variant="default">{msg.message_type.replace(/_/g, ' ')}</Badge>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
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
          padding: '4px 8px',
          overflowX: 'auto',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: expanded ? 'auto' : 'hidden',
        }}>
          {msg.content}
        </pre>
      ) : (
        <p style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {msg.content}
        </p>
      )}
    </button>
  )
}

function RunRow({ run }: { run: Run }) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  async function toggleExpand() {
    if (!expanded && messages.length === 0) {
      setLoadingMsgs(true)
      try {
        const msgs: Message[] = await api.getMessages(run.id)
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
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {run.workflow_id.slice(0, 8)}
        </span>

        <StatusBadge status={run.status} />

        <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {new Date(run.started_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}
        </span>

        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', width: 64, flexShrink: 0, textAlign: 'right' }}>
          {formatDuration(run.started_at, run.completed_at)}
        </span>

        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', width: 80, flexShrink: 0, textAlign: 'right' }}>
          {run.token_count_total.toLocaleString()}
        </span>

        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent-text)', width: 80, flexShrink: 0, textAlign: 'right' }}>
          ${run.estimated_cost_usd.toFixed(4)}
        </span>

        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-0)', borderTop: '1px solid var(--border-0)' }}>
          <Label style={{ marginBottom: 4 }}>Messages ({messages.length})</Label>
          {loadingMsgs && <Label>Loading messages…</Label>}
          {!loadingMsgs && messages.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No messages recorded for this run.</p>
          )}
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getRuns()
      .then((data: Run[]) => {
        setRuns(data)
        setHasMore(data.length === PAGE_SIZE)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function loadPage(newPage: number) {
    setLoading(true)
    try {
      const data: Run[] = await api.getRuns()
      setRuns(data)
      setPage(newPage)
      setHasMore(data.length === PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="layout-root">

      {/* Toolbar */}
      <div className="layout-toolbar">
        <a href="/canvas" style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
          Genesis
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Run History</span>
        {runs.length > 0 && (
          <Badge variant="default">{runs.length}</Badge>
        )}
      </div>

      {/* Table container */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Table header */}
          {runs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-1)', position: 'sticky', top: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 80, flexShrink: 0 }}>Workflow</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 80 }}>Status</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', flex: 1 }}>Started</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 64, textAlign: 'right' }}>Duration</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 80, textAlign: 'right' }}>Tokens</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 80, textAlign: 'right' }}>Cost</span>
              <span style={{ width: 16 }} />
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
              <Label>Loading runs…</Label>
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

          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}

          {/* Pagination */}
          {runs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '24px 16px', borderTop: '1px solid var(--border-0)' }}>
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => loadPage(page - 1)}
              >
                Previous
              </Button>
              <Label>Page {page + 1}</Label>
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
  )
}
