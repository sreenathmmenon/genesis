'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Nav } from '@/components/shared/Nav'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/lib/api'
import type { Run, Workflow } from '@/lib/types'

const ACRONYMS = new Set(['hn', 'ai', 'pr', 'api', 'oss', 'ml', 'ui', 'ux', 'db', 'ci', 'cd'])

function formatAgentName(name: string): string {
  return name
    .split('-')
    .map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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

function AgentWorkCard({ wf, latestRun }: { wf: Workflow; latestRun?: Run }) {
  const isActive = wf.status === 'active'
  const isPaused = wf.status === 'paused'

  return (
    <Link href={`/canvas?workflow_id=${wf.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          transition: 'all 120ms',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = '#D1D5DB'
          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = '#E5E7EB'
          el.style.boxShadow = 'none'
        }}
      >
        {/* Status dot */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isActive ? '#16A34A' : isPaused ? '#9CA3AF' : '#E5E7EB',
          flexShrink: 0,
          boxShadow: isActive ? '0 0 0 3px rgba(22,163,74,0.15)' : 'none',
        }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatAgentName(wf.name)}
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {wf.intent?.slice(0, 60) || wf.description?.slice(0, 60) || 'No description'}
          </div>
        </div>

        {/* Last run */}
        {latestRun && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
              {formatRelativeTime(latestRun.started_at)}
            </div>
            <StatusBadge status={latestRun.status} />
          </div>
        )}

        {/* Arrow */}
        <span style={{ fontSize: 12, color: '#D1D5DB', flexShrink: 0 }}>›</span>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [stats, setStats] = useState({ totalAgents: 0, activeNow: 0, runsToday: 0, totalCost: 0 })
  const [loading, setLoading] = useState(true)
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      try {
        const [runsData, workflowsData] = await Promise.all([
          api.getRuns({}) as Promise<Run[]>,
          api.getWorkflows() as Promise<Workflow[]>,
        ])

        const activeWfs = workflowsData
          .filter(w => w.status === 'active' || w.status === 'paused')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setRuns(runsData.slice(0, 8))
        setWorkflows(activeWfs.slice(0, 5))

        const nameMap: Record<string, string> = {}
        for (const wf of workflowsData) nameMap[wf.id] = wf.name
        setWorkflowNames(nameMap)

        const today = new Date(); today.setHours(0, 0, 0, 0)
        const runsToday = runsData.filter(r => new Date(r.started_at) >= today).length
        const activeAgents = workflowsData.filter(w => w.status === 'active').length
        const totalCost = runsData.reduce((sum, r) => sum + r.estimated_cost_usd, 0)

        setStats({ totalAgents: workflowsData.length, activeNow: activeAgents, runsToday, totalCost })
      } catch (err) {
        console.error('Failed to load dashboard', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Map runs to workflows for "latest run per workflow"
  const latestRunByWorkflow: Record<string, Run> = {}
  for (const run of runs) {
    if (!latestRunByWorkflow[run.workflow_id]) {
      latestRunByWorkflow[run.workflow_id] = run
    }
  }

  const STAT_CARDS = [
    {
      label: 'Active Agents',
      value: stats.activeNow,
      sub: `of ${stats.totalAgents} deployed`,
      accent: true,
      icon: '→',
    },
    {
      label: 'Runs Today',
      value: stats.runsToday,
      sub: 'executions',
      accent: false,
      icon: '↻',
    },
    {
      label: 'Total Agents',
      value: stats.totalAgents,
      sub: 'workflows built',
      accent: false,
      icon: '≡',
    },
    {
      label: 'Total Cost',
      value: `$${stats.totalCost.toFixed(3)}`,
      sub: 'all time',
      accent: false,
      icon: '$',
    },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content" style={{ overflowY: 'auto' }}>
        <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
                Command Center
              </h1>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                Your AI workforce at a glance
              </p>
            </div>
            <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
              + New Agent
            </Link>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            {STAT_CARDS.map((card) => (
              <div key={card.label} style={{
                background: card.accent ? '#F0FDF4' : '#FFFFFF',
                border: `1px solid ${card.accent ? '#BBF7D0' : '#E5E7EB'}`,
                borderRadius: 8,
                padding: '16px 18px',
                borderLeft: card.accent ? '3px solid #16A34A' : '3px solid #E5E7EB',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {card.label}
                  </span>
                  <span style={{ fontSize: 14, color: card.accent ? '#16A34A' : '#D1D5DB' }}>{card.icon}</span>
                </div>
                <div style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#111827',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 4,
                }}>
                  {loading ? (
                    <div className="animate-pulse bg-gray-200 rounded h-8 w-16" />
                  ) : card.value}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {card.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Left: My Agents quick list */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>My Agents</h2>
                <Link href="/workflows" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
                  View all →
                </Link>
              </div>

              {loading && (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</span>
                </div>
              )}

              {!loading && workflows.length === 0 && (
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '32px 20px',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 14 }}>No agents deployed yet</p>
                  <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none', fontSize: 13 }}>
                    Build your first agent
                  </Link>
                </div>
              )}

              {!loading && workflows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {workflows.map(wf => (
                    <AgentWorkCard
                      key={wf.id}
                      wf={wf}
                      latestRun={latestRunByWorkflow[wf.id]}
                    />
                  ))}
                  {workflows.length >= 5 && (
                    <Link href="/workflows" style={{
                      textAlign: 'center',
                      fontSize: 13,
                      color: '#6B7280',
                      textDecoration: 'none',
                      padding: '10px',
                      display: 'block',
                    }}>
                      See all agents →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Right: Recent runs */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Recent Runs</h2>
                <Link href="/history" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
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
                {loading && (
                  <div style={{ padding: '32px 0', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</span>
                  </div>
                )}

                {!loading && runs.length === 0 && (
                  <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 14 }}>No runs yet</p>
                    <Link href="/workflows" className="btn btn--primary" style={{ textDecoration: 'none', fontSize: 13 }}>
                      Run an agent
                    </Link>
                  </div>
                )}

                {runs.map((run, i) => (
                  <Link key={run.id} href={`/runs/${run.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px',
                        borderBottom: i < runs.length - 1 ? '1px solid #F3F4F6' : 'none',
                        background: '#FFFFFF',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#111827', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                          {workflowNames[run.workflow_id] ? formatAgentName(workflowNames[run.workflow_id] as string) : run.workflow_id.slice(0, 8) + '…'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {formatRelativeTime(run.started_at)} · {formatDuration(run.started_at, run.completed_at)}
                        </div>
                      </div>
                      <StatusBadge status={run.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

          </div>

          {/* "How it works" onboarding strip — only shows when no agents */}
          {!loading && workflows.length === 0 && (
            <div style={{
              marginTop: 32,
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
                How Genesis works
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {[
                  {
                    step: '1',
                    title: 'Describe your workflow',
                    body: 'Tell Genesis what you want in plain English — "Alert me when a GitHub PR sits unreviewed for 24 hours."',
                  },
                  {
                    step: '2',
                    title: 'Genesis builds the agent',
                    body: 'A team of meta-agents architects, builds, critiques, and validates the workflow. You see it happen live on the canvas.',
                  },
                  {
                    step: '3',
                    title: 'Agents work while you sleep',
                    body: 'Your deployed agents run autonomously on schedule or on demand. Review their work in your Inbox.',
                  },
                ].map(card => (
                  <div key={card.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24,
                      borderRadius: 6,
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#16A34A',
                      flexShrink: 0,
                    }}>{card.step}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{card.title}</div>
                      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{card.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <Link href="/canvas" className="btn btn--primary" style={{ textDecoration: 'none' }}>
                  Build your first agent →
                </Link>
                <Link href="/templates" style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#374151',
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}>
                  Browse templates
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
