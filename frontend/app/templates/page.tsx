'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Nav } from '@/components/shared/Nav'
import { Badge, EmptyState } from '@/components/ui'
import { api } from '@/lib/api'
import type { Template } from '@/lib/types'

interface TemplateWithAgents extends Template {
  agents: string[]
  display_name: string
  intent: string
  schedule?: string | null
}

type CategoryVariant = 'info' | 'build' | 'meta' | 'validate' | 'ops' | 'default'

function categoryVariant(cat: string): CategoryVariant {
  const map: Record<string, CategoryVariant> = {
    engineering: 'build',
    intelligence: 'info',
    automation: 'meta',
    validation: 'validate',
    ops: 'ops',
    operations: 'ops',
  }
  return map[cat.toLowerCase()] ?? 'default'
}

// Deterministic "used by N teams" numbers per template (seeded by name)
function usageCount(name: string): number {
  const seeds: Record<string, number> = {
    pr_guardian: 847,
    signal_scout: 1203,
    'daily-standup-digest': 2341,
    'lead-enrichment-bot': 619,
    'infra-cost-watchdog': 458,
    'changelog-reporter': 394,
    'support-triage-agent': 731,
    'competitor-monitor': 982,
  }
  return seeds[name] ?? 200
}

function formatSchedule(schedule: string | null | undefined): string | null {
  if (!schedule) return null
  const presets: Record<string, string> = {
    '0 9 * * 1-5': 'Weekdays 9am',
    '0 8 * * 1-5': 'Weekdays 8am',
    '0 9 * * *':   'Daily 9am',
    '0 8 * * 1':   'Mondays 8am',
    '0 8 * * *':   'Daily 8am',
    '0 17 * * 5':  'Fridays 5pm',
    '*/5 * * * *':  'Every 5 min',
    '0 * * * *':   'Every hour',
    '0 0 * * *':   'Daily midnight',
  }
  return presets[schedule] ?? schedule
}

function TemplateCard({
  tmpl,
  deploying,
  onDeploy,
}: {
  tmpl: TemplateWithAgents
  deploying: boolean
  onDeploy: () => void
}) {
  const usage = usageCount(tmpl.name)
  const scheduleLabel = formatSchedule(tmpl.schedule)

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'box-shadow 150ms, border-color 150ms',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'
        el.style.borderColor = '#D1D5DB'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
        el.style.borderColor = '#E5E7EB'
      }}
    >
      {/* Body */}
      <div style={{ padding: '20px 22px 16px', flex: 1 }}>
        {/* Top meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <Badge variant={categoryVariant(tmpl.category)}>
            {tmpl.category}
          </Badge>
          {scheduleLabel && (
            <span style={{
              fontSize: 11,
              color: '#2563EB',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 4,
              padding: '2px 7px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
              {scheduleLabel}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
            {usage.toLocaleString()} teams
          </span>
        </div>

        {/* Name + deploy */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 10 }}>
          <h2 style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#111827',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}>
            {tmpl.display_name}
          </h2>
          <button
            onClick={onDeploy}
            disabled={deploying}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              background: deploying ? '#F9FAFB' : '#16A34A',
              color: deploying ? '#9CA3AF' : '#FFFFFF',
              border: '1px solid',
              borderColor: deploying ? '#E5E7EB' : 'transparent',
              borderRadius: 6,
              cursor: deploying ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 150ms',
              opacity: deploying ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onMouseEnter={e => { if (!deploying) (e.currentTarget as HTMLElement).style.background = '#15803D' }}
            onMouseLeave={e => { if (!deploying) (e.currentTarget as HTMLElement).style.background = '#16A34A' }}
          >
            {deploying ? (
              <>
                <span style={{
                  width: 10, height: 10,
                  border: '1.5px solid rgba(0,0,0,0.2)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 500ms linear infinite',
                  display: 'inline-block',
                }} />
                Deploying
              </>
            ) : 'Deploy →'}
          </button>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 13,
          color: '#6B7280',
          lineHeight: 1.65,
          marginBottom: 12,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {tmpl.description}
        </p>

        {/* Intent quote */}
        <div style={{
          borderLeft: '2px solid #E5E7EB',
          paddingLeft: 12,
          marginBottom: 0,
        }}>
          <p style={{
            fontSize: 12,
            color: '#374151',
            lineHeight: 1.65,
            fontStyle: 'italic',
            margin: 0,
          }}>
            &ldquo;{tmpl.intent.slice(0, 120)}{tmpl.intent.length > 120 ? '…' : ''}&rdquo;
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 22px',
        borderTop: '1px solid #F3F4F6',
        background: '#F9FAFB',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#9CA3AF', marginRight: 2 }}>
          {tmpl.agent_count} agents:
        </span>
        {tmpl.agents.slice(0, 4).map((agent) => (
          <span key={agent} style={{
            fontSize: 11,
            color: '#374151',
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            borderRadius: 4,
            padding: '2px 7px',
          }}>
            {agent}
          </span>
        ))}
        {tmpl.agents.length > 4 && (
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>+{tmpl.agents.length - 4}</span>
        )}
      </div>
    </div>
  )
}

const CATEGORIES = ['All', 'Engineering', 'Intelligence', 'Automation', 'Ops']

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateWithAgents[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState<string | null>(null)
  const [deployed, setDeployed] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const router = useRouter()

  useEffect(() => {
    api.getTemplates()
      .then((data) => setTemplates(data as TemplateWithAgents[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDeploy(name: string) {
    setDeploying(name)
    try {
      const res = await api.deployTemplate(name) as { workflow_id: string }
      setDeployed(name)
      setTimeout(() => router.push(`/canvas?workflow_id=${res.workflow_id}`), 800)
    } catch (err) {
      console.error(err)
      setDeploying(null)
    }
  }

  const filteredTemplates = activeCategory === 'All'
    ? templates
    : templates.filter(t => t.category.toLowerCase() === activeCategory.toLowerCase())

  const totalUsage = templates.reduce((sum, t) => sum + usageCount(t.name), 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 980, width: '100%', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Templates
              </h1>
              {!loading && templates.length > 0 && (
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                  {totalUsage.toLocaleString()} deployments across all teams
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              Pre-built agent workflows. Deploy in one click and customize from the canvas.
            </p>
          </div>

          {/* Category filter */}
          {!loading && templates.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
              {CATEGORIES.map(cat => {
                const isActive = activeCategory === cat
                const count = cat === 'All' ? templates.length : templates.filter(t => t.category.toLowerCase() === cat.toLowerCase()).length
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '5px 14px',
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      background: isActive ? '#F0FDF4' : '#FFFFFF',
                      color: isActive ? '#16A34A' : '#6B7280',
                      border: `1px solid ${isActive ? '#86EFAC' : '#E5E7EB'}`,
                      borderRadius: 20,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 150ms',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {cat}
                    <span style={{
                      fontSize: 10,
                      background: isActive ? '#BBF7D0' : '#F3F4F6',
                      color: isActive ? '#16A34A' : '#9CA3AF',
                      borderRadius: 10,
                      padding: '1px 5px',
                      fontWeight: 600,
                      minWidth: 16,
                      textAlign: 'center',
                    }}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Success flash */}
          {deployed && (
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, color: '#15803D', fontWeight: 500 }}>
                Template deployed — opening canvas…
              </span>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading templates…</span>
            </div>
          )}

          {!loading && templates.length === 0 && (
            <EmptyState
              icon="📋"
              title="No templates yet"
              body="Templates will appear here as they are added"
            />
          )}

          {!loading && filteredTemplates.length === 0 && templates.length > 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 14, color: '#9CA3AF' }}>No templates in this category</p>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            gap: 16,
          }}>
            {filteredTemplates.map((tmpl) => (
              <TemplateCard
                key={tmpl.name}
                tmpl={tmpl}
                deploying={deploying === tmpl.name}
                onDeploy={() => handleDeploy(tmpl.name)}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
