'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/shared/Nav'
import { api } from '@/lib/api'
import { useWebSocket } from '@/lib/websocket'
import type { Workflow, SchedulerJob } from '@/lib/types'

function formatCron(expr: string): string {
  const presets: Record<string, string> = {
    '0 9 * * 1-5': 'Weekdays 9am',
    '0 8 * * 1-5': 'Weekdays 8am',
    '0 9 * * *':   'Daily 9am',
    '0 8 * * 1':   'Mondays 8am',
    '0 8 * * *':   'Daily 8am',
    '0 17 * * 5':  'Fridays 5pm',
    '*/5 * * * *':  'Every 5m',
    '*/15 * * * *': 'Every 15m',
    '0 */2 * * *':  'Every 2h',
    '0 * * * *':   'Every hour',
    '0 0 * * *':   'Daily midnight',
    '0 0 * * 1':   'Mondays midnight',
  }
  return presets[expr] ?? expr
}

function formatNextRun(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000)
  if (diffMin < 0) return 'overdue'
  if (diffMin < 60) return `in ${diffMin}m`
  const h = Math.round(diffMin / 60)
  if (h < 24) return `in ${h}h`
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
}

type CardRunStatus = 'idle' | 'running' | 'done' | 'failed'

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' ? 'var(--accent)'
    : status === 'paused' ? 'var(--text-tertiary)'
    : status === 'failed' ? 'var(--error)'
    : 'var(--text-tertiary)'
  const glow = status === 'active' ? '0 0 0 2px var(--accent-dim)' : 'none'
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: color,
      boxShadow: glow,
      flexShrink: 0,
      display: 'inline-block',
    }} />
  )
}

function AgentCard({ wf, nextRun, runStatus, onRun }: {
  wf: Workflow
  nextRun: string | null
  runStatus: CardRunStatus
  onRun: () => void
}) {
  const running = runStatus === 'running'
  const done = runStatus === 'done'
  const failed = runStatus === 'failed'

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: `1px solid ${running ? 'var(--accent-border)' : 'var(--border-1)'}`,
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 200ms, box-shadow 200ms',
      boxShadow: running ? '0 0 0 1px var(--accent-border)' : 'none',
    }}>
      <div style={{ padding: '18px 20px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Name */}
        <h3 style={{
          fontSize: 14, fontWeight: 600,
          color: 'var(--text-primary)', letterSpacing: '-0.01em',
          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {wf.name}
        </h3>

        {/* Intent */}
        <p style={{
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', minHeight: '3.6em',
        }}>
          {wf.intent || wf.description || '—'}
        </p>

        {/* Schedule / run state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {wf.schedule_expr ? (
            <span style={{
              fontSize: 11, color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }} />
              {formatCron(wf.schedule_expr)}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              On demand
            </span>
          )}
          {running && (
            <span style={{ fontSize: 11, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.2s infinite', flexShrink: 0 }} />
              Running
            </span>
          )}
          {done && (
            <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Done</span>
          )}
          {failed && (
            <span style={{ fontSize: 11, color: 'var(--error)' }}>Failed</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px',
        borderTop: '1px solid var(--border-0)',
        background: 'var(--surface-0)',
        flexShrink: 0,
      }}>
        <button
          onClick={onRun}
          disabled={running}
          style={{
            padding: '5px 14px', fontSize: 12, fontWeight: 500,
            background: running ? 'var(--surface-2)' : 'var(--surface-3)',
            color: running ? 'var(--text-tertiary)' : 'var(--text-primary)',
            border: `1px solid ${running ? 'var(--border-1)' : 'var(--border-2)'}`, borderRadius: 4,
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'background 120ms, color 120ms, border-color 120ms',
            opacity: running ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!running) { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--accent-border)'; el.style.color = 'var(--accent-text)' } }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-2)'; el.style.color = 'var(--text-primary)' }}
        >
          {running ? (
            <><span style={{ width: 8, height: 8, border: '1.5px solid var(--text-tertiary)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 500ms linear infinite', display: 'inline-block' }} /> Running…</>
          ) : done ? '✓ Done' : '▶ Run'}
        </button>
        <div style={{ flex: 1 }} />
        <Link href={`/canvas?workflow_id=${wf.id}`} style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none', padding: '4px 8px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
          Canvas
        </Link>
        <Link href={`/history?workflow_id=${wf.id}`} style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none', padding: '4px 8px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
          History
        </Link>
      </div>
    </div>
  )
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [jobs, setJobs] = useState<SchedulerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [runStates, setRunStates] = useState<Record<string, CardRunStatus>>({})
  const { subscribe } = useWebSocket()

  useEffect(() => {
    Promise.all([api.getWorkflows(), api.getSchedulerJobs()])
      .then(([wfs, js]) => {
        const active = (wfs as Workflow[])
          .filter(w => w.status === 'active' || w.status === 'paused')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setWorkflows(active)
        setJobs(js as SchedulerJob[])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unsub = subscribe('run_event', (p) => {
      const { event, workflow_id: wid } = p as { event: string; workflow_id: string }
      if (event === 'run_started') setRunStates(prev => ({ ...prev, [wid]: 'running' }))
      else if (event === 'run_completed') {
        setRunStates(prev => ({ ...prev, [wid]: 'done' }))
        setTimeout(() => setRunStates(prev => ({ ...prev, [wid]: 'idle' })), 3000)
      } else if (event === 'run_failed') {
        setRunStates(prev => ({ ...prev, [wid]: 'failed' }))
        setTimeout(() => setRunStates(prev => ({ ...prev, [wid]: 'idle' })), 5000)
      }
    })
    return unsub
  }, [subscribe])

  const handleRun = useCallback(async (wfId: string) => {
    setRunStates(prev => ({ ...prev, [wfId]: 'running' }))
    try {
      await api.runWorkflow(wfId)
    } catch {
      setRunStates(prev => ({ ...prev, [wfId]: 'failed' }))
      setTimeout(() => setRunStates(prev => ({ ...prev, [wfId]: 'idle' })), 4000)
    }
  }, [])

  const getNextRun = (wfId: string) =>
    jobs.find(j => j.job_id === `workflow_${wfId}`)?.next_run ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />
      <div className="page-content">
        <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
                My Agents
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {loading ? 'Loading…' : `${workflows.length} deployed`}
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary btn--sm" style={{ textDecoration: 'none' }}>
              + New Agent
            </Link>
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</span>
            </div>
          )}

          {!loading && workflows.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.2 }}>⬡</div>
                <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 16 }}>No agents deployed yet</p>
                <Link href="/canvas" className="btn btn--primary btn--sm" style={{ textDecoration: 'none' }}>Build your first agent →</Link>
              </div>
            </div>
          )}

          {!loading && workflows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {workflows.map(wf => (
                <AgentCard
                  key={wf.id}
                  wf={wf}
                  nextRun={getNextRun(wf.id)}
                  runStatus={runStates[wf.id] ?? 'idle'}
                  onRun={() => handleRun(wf.id)}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  )
}
