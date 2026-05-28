'use client'

import { useEffect, useState } from 'react'
import {
  Badge, Button, EmptyState, Label, Divider,
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

  const cardClass = {
    state_update: 'border-border-0 bg-surface-0',
    agent_output: 'border-border-1 bg-surface-1',
    tool_result:  'border-border-1 bg-surface-1',
    human_input:  'border-accent-border bg-accent-dim',
    tool_call:    'border-border-2 bg-surface-2',
  }[msg.message_type] ?? 'border-border-1 bg-surface-1'

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      className={`w-full text-left flex flex-col gap-1 px-3 py-2 rounded-md border transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${cardClass}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate max-w-[90px]">
          {msg.sender_agent}
        </span>
        <span className="text-xs text-text-tertiary flex-shrink-0">→</span>
        <span className="text-sm text-text-secondary truncate max-w-[90px]">
          {msg.receiver_agent}
        </span>
        <div className="flex-1" />
        <Badge variant="default">{msg.message_type.replace(/_/g, ' ')}</Badge>
        <span className="text-xs font-mono text-text-tertiary flex-shrink-0">
          {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false })}
        </span>
      </div>
      {msg.message_type === 'tool_call' ? (
        <pre className={`text-xs font-mono text-text-secondary bg-surface-0 border border-border-1 rounded-sm px-2 py-1 overflow-x-auto ${expanded ? '' : 'line-clamp-2'}`}>
          {msg.content}
        </pre>
      ) : (
        <p className={`text-xs text-text-tertiary leading-snug break-words ${expanded ? '' : 'line-clamp-2'}`}>
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
    <div className="border-b border-border-0 last:border-0">
      {/* Row */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-2 transition-colors duration-fast text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {/* Workflow ID (abbreviated) */}
        <span className="text-xs font-mono text-text-tertiary w-20 flex-shrink-0 truncate">
          {run.workflow_id.slice(0, 8)}
        </span>

        <StatusBadge status={run.status} />

        <span className="text-sm text-text-secondary flex-1 truncate">
          {new Date(run.started_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}
        </span>

        <span className="text-sm font-mono text-text-tertiary w-16 flex-shrink-0 text-right">
          {formatDuration(run.started_at, run.completed_at)}
        </span>

        <span className="text-sm font-mono text-text-tertiary w-20 flex-shrink-0 text-right">
          {run.token_count_total.toLocaleString()}
        </span>

        <span className="text-sm font-mono text-accent-text w-20 flex-shrink-0 text-right">
          ${run.estimated_cost_usd.toFixed(4)}
        </span>

        <span className="text-xs text-text-tertiary flex-shrink-0">
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {/* Expanded messages */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2 bg-surface-0 border-t border-border-0">
          <div className="pt-3">
            <Label className="mb-2 block">Messages ({messages.length})</Label>
          </div>
          {loadingMsgs && <Label>Loading messages…</Label>}
          {!loadingMsgs && messages.length === 0 && (
            <p className="text-sm text-text-tertiary">No messages recorded for this run.</p>
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
        <a href="/canvas" className="text-lg font-semibold text-accent tracking-tight">
          Genesis
        </a>
        <div className="w-px h-4 bg-border-1" />
        <span className="text-md font-medium text-text-primary">Run History</span>
        {runs.length > 0 && (
          <Badge variant="default">{runs.length}</Badge>
        )}
      </div>

      {/* Table container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">

          {/* Table header */}
          {runs.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-3 border-b border-border-1 bg-surface-1 sticky top-0">
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary w-20 flex-shrink-0">
                Workflow
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary w-20">
                Status
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary flex-1">
                Started
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary w-16 text-right">
                Duration
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary w-20 text-right">
                Tokens
              </span>
              <span className="text-xs font-medium tracking-wider uppercase text-text-tertiary w-20 text-right">
                Cost
              </span>
              <span className="w-4" />
            </div>
          )}

          {/* Rows */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Label>Loading runs…</Label>
            </div>
          )}

          {!loading && runs.length === 0 && (
            <EmptyState
              icon="📋"
              title="No runs yet"
              body="Run history will appear here once workflows have executed"
              className="py-16"
            />
          )}

          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}

          {/* Pagination */}
          {runs.length > 0 && (
            <div className="flex items-center justify-center gap-3 px-4 py-6 border-t border-border-0">
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
