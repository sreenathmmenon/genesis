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
      background: '#FFFFFF',
      border: `1px solid ${running ? '#16A34A' : '#E5E7EB'}`,
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 200ms, box-shadow 200ms',
      boxShadow: running
        ? '0 4px 16px rgba(22,163,74,0.12), 0 1px 3px rgba(0,0,0,0.06)'
        : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '18px 20px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {wf.status === 'active' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', flexShrink: 0 }} />
          )}
          {wf.status === 'paused' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }} />
          )}
          <h3 style={{
            fontSize: 14, fontWeight: 600,
            color: '#111827', letterSpacing: '-0.01em',
            lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {wf.name}
          </h3>
        </div>

        {/* Intent */}
        <p style={{
          fontSize: 13, color: '#6B7280', lineHeight: 1.6,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', minHeight: '3.6em',
        }}>
          {wf.intent || wf.description || '—'}
        </p>

        {/* Schedule / run state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {wf.schedule_expr ? (
            <span style={{
              fontSize: 12,
              color: '#2563EB',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 4,
              padding: '2px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
              {formatCron(wf.schedule_expr)}
            </span>
          ) : (
            <span style={{
              fontSize: 12,
              color: '#6B7280',
              background: '#F3F4F6',
              border: '1px solid #E5E7EB',
              borderRadius: 4,
              padding: '2px 8px',
            }}>
              On demand
            </span>
          )}
          {running && (
            <span style={{ fontSize: 12, color: '#D97706', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#D97706', animation: 'pulse-dot 1.2s infinite', flexShrink: 0 }} />
              Running…
            </span>
          )}
          {done && (
            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>✓ Done</span>
          )}
          {failed && (
            <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 500 }}>Failed</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px',
        borderTop: '1px solid #F3F4F6',
        background: '#F9FAFB',
        flexShrink: 0,
      }}>
        <button
          onClick={onRun}
          disabled={running}
          style={{
            padding: '6px 14px', fontSize: 13, fontWeight: 500,
            background: running ? '#F9FAFB' : '#FFFFFF',
            color: running ? '#9CA3AF' : '#374151',
            border: `1px solid ${running ? '#E5E7EB' : '#E5E7EB'}`,
            borderRadius: 6,
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'background 150ms, color 150ms, border-color 150ms',
            opacity: running ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            if (!running) {
              const el = e.currentTarget as HTMLElement
              el.style.background = '#F0FDF4'
              el.style.borderColor = '#16A34A'
              el.style.color = '#16A34A'
            }
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = '#FFFFFF'
            el.style.borderColor = '#E5E7EB'
            el.style.color = '#374151'
          }}
        >
          {running ? (
            <>
              <span style={{
                width: 10, height: 10,
                border: '1.5px solid #D1D5DB',
                borderTopColor: '#6B7280',
                borderRadius: '50%',
                animation: 'spin 500ms linear infinite',
                display: 'inline-block',
                flexShrink: 0,
              }} />
              Running…
            </>
          ) : done ? '✓ Done' : '▶ Run'}
        </button>
        <div style={{ flex: 1 }} />
        <Link
          href={`/canvas?workflow_id=${wf.id}`}
          style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none', padding: '4px 8px', borderRadius: 4, transition: 'color 150ms' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
        >
          Canvas
        </Link>
        <Link
          href={`/history?workflow_id=${wf.id}`}
          style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none', padding: '4px 8px', borderRadius: 4, transition: 'color 150ms' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
        >
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content">
        <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
                My Agents
              </h1>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                {loading ? 'Loading…' : `${workflows.length} deployed`}
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
              + New Agent
            </Link>
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</span>
            </div>
          )}

          {!loading && workflows.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 360 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.2 }}>⬡</div>
                <p style={{ fontSize: 15, color: '#6B7280', marginBottom: 20, fontWeight: 500 }}>No agents deployed yet</p>
                <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20, maxWidth: 280 }}>
                  Build your first agent workflow using the Canvas.
                </p>
                <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
                  Build your first agent →
                </Link>
              </div>
            </div>
          )}

          {!loading && workflows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
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
    </div>
  )
}
