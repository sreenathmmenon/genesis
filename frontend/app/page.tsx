'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Nav } from '@/components/shared/Nav'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Workflow } from '@/lib/types'

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function formatRelativeTime(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function HomePage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState({ totalAgents: 0, activeNow: 0, runsToday: 0, toolsAvailable: 0 })
  const [loading, setLoading] = useState(true)
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      try {
        const [runsData, workflowsData] = await Promise.all([
          api.getRuns() as Promise<Run[]>,
          api.getWorkflows() as Promise<Workflow[]>,
        ])
        setRuns(runsData.slice(0, 10))
        const nameMap: Record<string, string> = {}
        for (const wf of workflowsData) nameMap[wf.id] = wf.name
        setWorkflowNames(nameMap)

        const today = new Date(); today.setHours(0, 0, 0, 0)
        const runsToday = runsData.filter(r => new Date(r.started_at) >= today).length
        const activeAgents = workflowsData.filter(w => w.status === 'active').length

        let toolsAvailable = 0
        try { toolsAvailable = (await api.getToolNames() as string[]).length } catch {}

        setStats({ totalAgents: workflowsData.length, activeNow: activeAgents, runsToday, toolsAvailable })
      } catch (err) {
        console.error('Failed to load dashboard', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const STAT_CARDS = [
    { label: 'Total Agents', value: stats.totalAgents, suffix: '' },
    { label: 'Active', value: stats.activeNow, suffix: '' },
    { label: 'Runs Today', value: stats.runsToday, suffix: '' },
    { label: 'Tools', value: stats.toolsAvailable, suffix: '' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />
      <div className="page-content">
        <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
                Dashboard
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Your agent platform at a glance
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary btn--sm" style={{ textDecoration: 'none' }}>
              + New Agent
            </Link>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 36 }}>
            {STAT_CARDS.map((card) => (
              <div key={card.label} style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-1)',
                borderRadius: 6,
                padding: '18px 20px 14px',
              }}>
                <div style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 8,
                  fontFamily: 'var(--font-sans)',
                }}>
                  {loading ? '—' : card.value}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Recent Activity
              </h2>
              <Link href="/history" style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                View all →
              </Link>
            </div>

            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 6, overflow: 'hidden' }}>
              {/* Header row */}
              {!loading && runs.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 110px 70px',
                  gap: 12, padding: '9px 16px',
                  borderBottom: '1px solid var(--border-0)',
                  background: 'var(--surface-1)',
                }}>
                  {['Workflow', 'Status', 'When', 'Duration'].map(col => (
                    <span key={col} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                      {col}
                    </span>
                  ))}
                </div>
              )}

              {loading && (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</span>
                </div>
              )}

              {!loading && runs.length === 0 && (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8 }}>No runs yet</div>
                  <Link href="/canvas" className="btn btn--primary btn--sm" style={{ textDecoration: 'none' }}>Build your first agent →</Link>
                </div>
              )}

              {runs.map((run, i) => (
                <Link key={run.id} href="/history" style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 90px 110px 70px',
                      gap: 12, padding: '11px 16px',
                      borderBottom: i < runs.length - 1 ? '1px solid var(--border-0)' : 'none',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {workflowNames[run.workflow_id] ?? run.workflow_id.slice(0, 8) + '…'}
                    </span>
                    <StatusBadge status={run.status} />
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatRelativeTime(run.started_at)}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      {formatDuration(run.started_at, run.completed_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
