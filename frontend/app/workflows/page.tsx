'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Label, StatusDot } from '@/components/ui'
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

interface RunState {
  status: 'idle' | 'running' | 'completed' | 'failed'
}

function WorkflowRow({
  wf,
  nextRun,
  runState,
  onRun,
  onRemoveSchedule,
}: {
  wf: Workflow
  nextRun: string | null
  runState: RunState
  onRun: () => void
  onRemoveSchedule: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 20px',
      borderBottom: '1px solid var(--border-0)',
    }}>
      {/* Status dot + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 2 }}>
        <StatusDot state={statusDotState(wf.status)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {wf.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            {wf.intent}
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {wf.schedule_expr ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge variant="info">{wf.schedule_expr}</Badge>
              <button
                onClick={onRemoveSchedule}
                style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                title="Remove schedule"
              >
                ✕
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Next: {formatNextRun(nextRun)}
            </span>
          </div>
        ) : (
          <Badge variant="default">On demand</Badge>
        )}
      </div>

      {/* Run status */}
      <div style={{ width: 80, flexShrink: 0 }}>
        {runState.status === 'running' && (
          <Badge variant="accent">Running</Badge>
        )}
        {runState.status === 'completed' && (
          <Badge variant="success">Done</Badge>
        )}
        {runState.status === 'failed' && (
          <Badge variant="error">Failed</Badge>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRun}
          disabled={runState.status === 'running'}
        >
          {runState.status === 'running' ? 'Running…' : 'Run Now'}
        </Button>
        <a
          href={`/canvas?workflow_id=${wf.id}`}
          className="btn btn--ghost btn--sm"
          style={{ textDecoration: 'none' }}
        >
          Canvas
        </a>
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
        setTimeout(() => setRunStates((prev) => ({ ...prev, [wid]: { status: 'idle' } })), 4000)
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
    }
  }

  async function handleRemoveSchedule(wfId: string) {
    try {
      const updated = await api.removeSchedule(wfId) as Workflow
      setWorkflows((prev) => prev.map((w) => (w.id === wfId ? updated : w)))
      setJobs((prev) => prev.filter((j) => !j.job_id.includes(wfId)))
    } catch (err) {
      console.error(err)
    }
  }

  function getNextRun(wfId: string): string | null {
    const job = jobs.find((j) => j.job_id === `workflow_${wfId}`)
    return job?.next_run ?? null
  }

  const activeCount = workflows.filter((w) => w.status === 'active').length
  const scheduledCount = workflows.filter((w) => w.schedule_expr).length

  return (
    <div className="layout-root">

      {/* Toolbar */}
      <div className="layout-toolbar">
        <a href="/canvas" style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
          Genesis
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>My Agents</span>
        <div style={{ flex: 1 }} />
        <a href="/history" className="btn btn--ghost btn--sm" style={{ textDecoration: 'none' }}>Run History</a>
        <a href="/templates" className="btn btn--ghost btn--sm" style={{ textDecoration: 'none' }}>Templates</a>
        <a href="/canvas" className="btn btn--secondary btn--sm" style={{ textDecoration: 'none' }}>New Build</a>
      </div>

      {/* Stats bar */}
      {workflows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 20px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Label>Deployed</Label>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{workflows.length}</span>
          </div>
          <div style={{ width: 1, height: 32, background: 'var(--border-1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Label>Active</Label>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>{activeCount}</span>
          </div>
          <div style={{ width: 1, height: 32, background: 'var(--border-1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Label>Scheduled</Label>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{scheduledCount}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>

          {/* Column headers */}
          {workflows.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '10px 20px',
              borderBottom: '1px solid var(--border-1)',
              background: 'var(--surface-1)',
              position: 'sticky',
              top: 0,
            }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', flex: 2 }}>Agent / Workflow</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', flex: 1 }}>Schedule</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 80, flexShrink: 0 }}>Status</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', width: 140, flexShrink: 0, textAlign: 'right' }}>Actions</span>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
              <Label>Loading agents…</Label>
            </div>
          )}

          {!loading && workflows.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
              <EmptyState
                icon="🤖"
                title="No agents deployed yet"
                body="Build and deploy your first agent workflow to see it here"
                style={{ paddingTop: 48, paddingBottom: 48 }}
              />
            </div>
          )}

          {workflows.map((wf) => (
            <WorkflowRow
              key={wf.id}
              wf={wf}
              nextRun={getNextRun(wf.id)}
              runState={runStates[wf.id] ?? { status: 'idle' }}
              onRun={() => handleRun(wf.id)}
              onRemoveSchedule={() => handleRemoveSchedule(wf.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
