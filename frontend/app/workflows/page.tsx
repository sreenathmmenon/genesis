'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/shared/Nav'
import { Badge, Button, EmptyState, StatusDot } from '@/components/ui'
import { api } from '@/lib/api'
import { useWebSocket } from '@/lib/websocket'
import type { Workflow, SchedulerJob } from '@/lib/types'

function formatNextRun(isoStr: string | null): string {
  if (!isoStr) return 'Not scheduled'
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs < 0) return 'Overdue'
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 60) return `in ${diffMin}m`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `in ${diffH}h`
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
}

function statusDotState(status: string): 'active' | 'idle' | 'error' | 'building' | 'info' {
  const map: Record<string, 'active' | 'idle' | 'error' | 'building' | 'info'> = {
    active: 'active',
    paused: 'idle',
    failed: 'error',
    building: 'building',
    validating: 'info',
    draft: 'idle',
    awaiting_approval: 'info',
  }
  return map[status] ?? 'idle'
}

type RunCardStatus = 'idle' | 'running' | 'completed' | 'failed'

interface RunState {
  status: RunCardStatus
}

function AgentCard({
  wf,
  nextRun,
  runState,
  onRun,
}: {
  wf: Workflow
  nextRun: string | null
  runState: RunState
  onRun: () => void
}) {
  const isRunning = runState.status === 'running'
  const isDone = runState.status === 'completed'

  return (
    <div
      className={`card card-hover${isRunning ? ' glow-running' : ''}`}
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 150ms, box-shadow 150ms, border-color 150ms',
      }}
    >
      {/* Top accent bar */}
      <div style={{
        height: 3,
        background: isRunning ? 'var(--accent)' : 'var(--border-1)',
        transition: 'background 300ms',
        flexShrink: 0,
      }} />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>

        {/* Row 1: name + status dot */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {wf.name}
          </h3>
          <StatusDot state={statusDotState(wf.status)} />
        </div>

        {/* Row 2: intent text */}
        <p style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '2.6em',
        }}>
          {wf.intent || wf.description || 'No description provided'}
        </p>

        {/* Row 3: schedule + next run */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {wf.schedule_expr ? (
            <>
              <Badge variant="info">{wf.schedule_expr}</Badge>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Next: {formatNextRun(nextRun)}
              </span>
            </>
          ) : (
            <Badge variant="default">On demand</Badge>
          )}
          {isRunning && (
            <Badge variant="accent">
              <span style={{
                display: 'inline-block',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
                marginRight: 4,
                animation: 'pulse-subtle 1.5s infinite',
              }} />
              Running
            </Badge>
          )}
          {isDone && (
            <Badge variant="success">Done ✓</Badge>
          )}
          {runState.status === 'failed' && (
            <Badge variant="error">Failed</Badge>
          )}
        </div>

      </div>

      {/* Bottom action row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        borderTop: '1px solid var(--border-0)',
        background: 'var(--surface-0)',
        flexShrink: 0,
      }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRun}
          disabled={isRunning}
          style={{ minWidth: 72 }}
        >
          {isRunning ? (
            <>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                border: '1.5px solid var(--text-tertiary)',
                borderTopColor: 'var(--text-primary)',
                borderRadius: '50%',
                animation: 'spin 600ms linear infinite',
              }} />
              Running
            </>
          ) : isDone ? 'Done ✓' : 'Run Now'}
        </Button>

        <div style={{ flex: 1 }} />

        <Link
          href={`/canvas?workflow_id=${wf.id}`}
          className="btn btn--ghost btn--sm"
          style={{ textDecoration: 'none' }}
        >
          View
        </Link>
        <Link
          href={`/history?workflow_id=${wf.id}`}
          className="btn btn--ghost btn--sm"
          style={{ textDecoration: 'none' }}
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
  const [runStates, setRunStates] = useState<Record<string, RunState>>({})

  const { subscribe } = useWebSocket()

  useEffect(() => {
    Promise.all([api.getWorkflows(), api.getSchedulerJobs()])
      .then(([wfs, js]) => {
        setWorkflows((wfs as Workflow[]).filter((w) => w.status === 'active' || w.status === 'paused'))
        setJobs(js as SchedulerJob[])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unsub = subscribe('run_event', (p) => {
      const payload = p as { event: string; workflow_id: string; run_id: string }
      const wid = payload.workflow_id
      if (payload.event === 'run_started') {
        setRunStates((prev) => ({ ...prev, [wid]: { status: 'running' } }))
      } else if (payload.event === 'run_completed') {
        setRunStates((prev) => ({ ...prev, [wid]: { status: 'completed' } }))
        setTimeout(() => setRunStates((prev) => ({ ...prev, [wid]: { status: 'idle' } })), 3000)
      } else if (payload.event === 'run_failed') {
        setRunStates((prev) => ({ ...prev, [wid]: { status: 'failed' } }))
        setTimeout(() => setRunStates((prev) => ({ ...prev, [wid]: { status: 'idle' } })), 6000)
      }
    })
    return unsub
  }, [subscribe])

  async function handleRun(wfId: string) {
    setRunStates((prev) => ({ ...prev, [wfId]: { status: 'running' } }))
    try {
      await api.runWorkflow(wfId)
    } catch (err) {
      console.error(err)
      setRunStates((prev) => ({ ...prev, [wfId]: { status: 'failed' } }))
      setTimeout(() => setRunStates((prev) => ({ ...prev, [wfId]: { status: 'idle' } })), 4000)
    }
  }

  function getNextRun(wfId: string): string | null {
    const job = jobs.find((j) => j.job_id === `workflow_${wfId}`)
    return job?.next_run ?? null
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 960, width: '100%', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                My Agents
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {loading ? 'Loading…' : `${workflows.length} deployed`}
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary">
              New Agent +
            </Link>
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading agents…</span>
            </div>
          )}

          {/* Empty state */}
          {!loading && workflows.length === 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 400,
            }}>
              <EmptyState
                icon="🤖"
                title="No agents deployed yet"
                body="Build and deploy your first agent workflow to see it here"
                action={
                  <Link href="/canvas" className="btn btn--primary btn--sm">
                    Build your first agent →
                  </Link>
                }
              />
            </div>
          )}

          {/* Agent cards grid */}
          {!loading && workflows.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: 16,
            }}>
              {workflows.map((wf) => (
                <AgentCard
                  key={wf.id}
                  wf={wf}
                  nextRun={getNextRun(wf.id)}
                  runState={runStates[wf.id] ?? { status: 'idle' }}
                  onRun={() => handleRun(wf.id)}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Spin keyframe injected inline */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
