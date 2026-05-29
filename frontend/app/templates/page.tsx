'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Nav } from '@/components/shared/Nav'
import { Badge, Button, EmptyState, Label } from '@/components/ui'
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
    <div className="card card-hover" style={{ padding: 0, overflow: 'hidden' }}>
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
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}>
            {tmpl.display_name}
          </h2>
          <Button
            variant="primary"
            size="sm"
            onClick={onDeploy}
            disabled={deploying}
            style={{ flexShrink: 0 }}
          >
            {deploying ? 'Deploying…' : 'Deploy →'}
          </Button>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          marginTop: 8,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {tmpl.description}
        </p>
      </div>

      {/* Intent preview — code-style box with lime left border */}
      <div style={{
        margin: '0 24px',
        borderLeft: '3px solid var(--accent)',
        background: 'var(--accent-dim)',
        borderRadius: '0 4px 4px 0',
        padding: '10px 14px',
        marginBottom: 16,
      }}>
        <p style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent-text)',
          lineHeight: 1.6,
          fontStyle: 'italic',
          margin: 0,
        }}>
          &ldquo;{tmpl.intent}&rdquo;
        </p>
      </div>

      {/* Agent pills */}
      <div style={{
        padding: '12px 24px 20px',
        borderTop: '1px solid var(--border-0)',
        background: 'var(--surface-0)',
      }}>
        <Label style={{ marginBottom: 8 }}>Agents</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tmpl.agents.map((agent) => (
            <Badge key={agent} variant="default">
              {agent}
            </Badge>
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-0)' }}>
      <Nav />

      <div className="page-content">
        <div style={{ maxWidth: 840, width: '100%', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 6,
            }}>
              Templates
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Pre-built agent workflows, ready to deploy
            </p>
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading templates…</span>
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
