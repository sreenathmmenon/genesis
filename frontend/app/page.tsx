'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Nav } from '@/components/shared/Nav'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Workflow } from '@/lib/types'

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'running'
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
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

interface Stats {
  totalAgents: number
  activeNow: number
  runsToday: number
  toolsAvailable: number
}

export default function HomePage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<Stats>({ totalAgents: 0, activeNow: 0, runsToday: 0, toolsAvailable: 0 })
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

        // Build workflow name lookup
        const nameMap: Record<string, string> = {}
        for (const wf of workflowsData) {
          nameMap[wf.id] = wf.name
        }
        setWorkflowNames(nameMap)

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const runsToday = runsData.filter(
          (r) => new Date(r.started_at) >= today
        ).length

        const activeAgents = workflowsData.filter((w) => w.status === 'active').length
        const totalAgents = workflowsData.length

        // Try to get tool count
        let toolsAvailable = 0
        try {
          const tools = await api.getToolNames() as string[]
          toolsAvailable = tools.length
        } catch {
          toolsAvailable = 0
        }

        setStats({
          totalAgents,
          activeNow: activeAgents,
          runsToday,
          toolsAvailable,
        })
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const STAT_CARDS = [
    { label: 'Total Agents', value: stats.totalAgents },
    { label: 'Active Now', value: stats.activeNow },
    { label: 'Runs Today', value: stats.runsToday },
    { label: 'Tools Available', value: stats.toolsAvailable },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Page header + CTA */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                Dashboard
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                Overview of your agent platform
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary">
              Build New Agent →
            </Link>
          </div>

          {/* Stat cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 40,
          }}>
            {STAT_CARDS.map((card) => (
              <div
                key={card.label}
                className="card card-hover"
                style={{ padding: '20px 20px 16px' }}
              >
                <div style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  marginBottom: 8,
                  fontFamily: 'var(--font-sans)',
                }}>
                  {loading ? '—' : card.value}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* Activity feed */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Recent Activity
              </h2>
              <Link
                href="/history"
                style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' }}
                className="btn btn--ghost btn--sm"
              >
                View all
              </Link>
            </div>

            <div style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border-1)',
              borderRadius: 5,
              overflow: 'hidden',
            }}>
              {/* Table header */}
              {runs.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 120px 80px',
                  gap: 16,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-1)',
                  background: 'var(--surface-1)',
                }}>
                  {['Workflow', 'Status', 'Started', 'Duration'].map((col) => (
                    <span key={col} style={{
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                    }}>
                      {col}
                    </span>
                  ))}
                </div>
              )}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</span>
                </div>
              )}

              {!loading && runs.length === 0 && (
                <div className="empty-state" style={{ padding: '64px 24px' }}>
                  <div className="empty-state-icon">⬡</div>
                  <p className="empty-state-title">No runs yet — build your first agent</p>
                  <p className="empty-state-body">Run history will appear here once workflows have executed</p>
                  <div style={{ marginTop: 12 }}>
                    <Link href="/canvas" className="btn btn--primary btn--sm">
                      Build your first agent →
                    </Link>
                  </div>
                </div>
              )}

              {runs.map((run) => (
                <Link
                  key={run.id}
                  href="/history"
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 120px 80px',
                    gap: 16,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-0)',
                    cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {workflowNames[run.workflow_id] ?? run.workflow_id.slice(0, 8) + '…'}
                    </span>
                    <div>
                      <StatusBadge status={run.status} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {formatRelativeTime(run.started_at)}
                    </span>
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
