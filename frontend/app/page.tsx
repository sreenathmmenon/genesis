'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Nav } from '@/components/shared/Nav'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Workflow } from '@/lib/types'

function formatAgentName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

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
    { label: 'Total Agents', value: stats.totalAgents, accent: false },
    { label: 'Active Now', value: stats.activeNow, accent: true },
    { label: 'Runs Today', value: stats.runsToday, accent: false },
    { label: 'Tools', value: stats.toolsAvailable, accent: false },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content">
        <div style={{ maxWidth: 880, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
                Dashboard
              </h1>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                Your agent platform at a glance
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
              + New Agent
            </Link>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 36 }}>
            {STAT_CARDS.map((card) => (
              <div key={card.label} style={{
                background: card.accent ? '#F0FDF4' : '#FFFFFF',
                border: `1px solid ${card.accent ? '#BBF7D0' : '#E5E7EB'}`,
                borderRadius: 8,
                padding: '20px 20px 16px',
                borderLeft: card.accent ? '3px solid #16A34A' : '3px solid #E5E7EB',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#111827',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {loading ? '—' : card.value}
                </div>
                <div style={{
                  fontSize: 13,
                  color: '#6B7280',
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
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>
                Recent Activity
              </h2>
              <Link
                href="/history"
                style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none', transition: 'color 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
              >
                View all →
              </Link>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              {/* Header row */}
              {!loading && runs.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px',
                  gap: 12, padding: '10px 20px',
                  borderBottom: '1px solid #E5E7EB',
                  background: '#F9FAFB',
                }}>
                  {['Workflow', 'Status', 'When', 'Duration'].map(col => (
                    <span key={col} style={{
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#6B7280',
                    }}>
                      {col}
                    </span>
                  ))}
                </div>
              )}

              {loading && (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</span>
                </div>
              )}

              {!loading && runs.length === 0 && (
                <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.25 }}>▦</div>
                  <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>No runs yet</p>
                  <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
                    Build your first agent →
                  </Link>
                </div>
              )}

              {runs.map((run, i) => (
                <Link key={run.id} href="/history" style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px',
                      gap: 12, padding: '11px 20px',
                      borderBottom: i < runs.length - 1 ? '1px solid #F3F4F6' : 'none',
                      transition: 'background 120ms',
                      background: '#FFFFFF',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                  >
                    <span style={{ fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {workflowNames[run.workflow_id] ? formatAgentName(workflowNames[run.workflow_id]) : run.workflow_id.slice(0, 8) + '…'}
                    </span>
                    <StatusBadge status={run.status} />
                    <span style={{ fontSize: 13, color: '#6B7280' }}>{formatRelativeTime(run.started_at)}</span>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#6B7280' }}>
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
