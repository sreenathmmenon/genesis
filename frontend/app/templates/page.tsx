'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Nav } from '@/components/shared/Nav'
import { Badge, EmptyState, Label } from '@/components/ui'
import { api } from '@/lib/api'
import type { Template } from '@/lib/types'

interface TemplateWithAgents extends Template {
  agents: string[]
  display_name: string
  intent: string
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

function TemplateCard({
  tmpl,
  deploying,
  onDeploy,
}: {
  tmpl: TemplateWithAgents
  deploying: boolean
  onDeploy: () => void
}) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'box-shadow 150ms, border-color 150ms',
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLElement
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
      el.style.borderColor = '#D1D5DB'
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLElement
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
      el.style.borderColor = '#E5E7EB'
    }}
    >
      {/* Header area */}
      <div style={{ padding: '20px 24px 16px' }}>
        {/* Category badge + agent count row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Badge variant={categoryVariant(tmpl.category)}>
            {tmpl.category}
          </Badge>
          <Label style={{ marginBottom: 0 }}>{tmpl.agent_count} agents</Label>
        </div>

        {/* Template name + Deploy button row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <h2 style={{
            fontSize: 17,
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
            className="btn btn--primary btn--sm"
            style={{ flexShrink: 0, opacity: deploying ? 0.6 : 1 }}
          >
            {deploying ? 'Deploying…' : 'Deploy →'}
          </button>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 14,
          color: '#6B7280',
          lineHeight: 1.6,
          marginTop: 10,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {tmpl.description}
        </p>
      </div>

      {/* Intent preview */}
      <div style={{
        margin: '0 24px 16px',
        borderLeft: '2px solid #E5E7EB',
        padding: '8px 14px',
        background: '#F9FAFB',
        borderRadius: '0 4px 4px 0',
      }}>
        <p style={{
          fontSize: 13,
          color: '#374151',
          lineHeight: 1.65,
          fontStyle: 'italic',
          margin: 0,
        }}>
          &ldquo;{tmpl.intent}&rdquo;
        </p>
      </div>

      {/* Agent pills */}
      <div style={{
        padding: '12px 24px 20px',
        borderTop: '1px solid #F3F4F6',
        background: '#F9FAFB',
      }}>
        <Label style={{ marginBottom: 8 }}>Agents</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tmpl.agents.map((agent) => (
            <span key={agent} style={{
              fontSize: 12,
              color: '#374151',
              background: '#F3F4F6',
              border: '1px solid #E5E7EB',
              borderRadius: 4,
              padding: '2px 8px',
              fontWeight: 400,
            }}>
              {agent}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateWithAgents[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState<string | null>(null)
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
      router.push(`/canvas?workflow_id=${res.workflow_id}`)
    } catch (err) {
      console.error(err)
      setDeploying(null)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
              Templates
            </h1>
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              Pre-built agent workflows, ready to deploy in one click
            </p>
          </div>

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {templates.map((tmpl) => (
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
