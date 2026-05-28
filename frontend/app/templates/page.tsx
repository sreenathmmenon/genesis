'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, CardBody, EmptyState, Label } from '@/components/ui'
import { api } from '@/lib/api'
import type { Template } from '@/lib/types'

const CATEGORY_VARIANT: Record<string, 'info' | 'build'> = {
  engineering: 'build',
  intelligence: 'info',
}

interface TemplateWithAgents extends Template {
  agents: string[]
  display_name: string
  intent: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateWithAgents[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    api.getTemplates()
      .then((data: TemplateWithAgents[]) => setTemplates(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleDeploy(name: string) {
    setDeploying(name)
    try {
      const res = await api.deployTemplate(name)
      router.push(`/canvas?workflow_id=${res.workflow_id}`)
    } catch (err) {
      console.error(err)
      setDeploying(null)
    }
  }

  return (
    <div className="layout-root">

      {/* Toolbar */}
      <div className="layout-toolbar">
        <a href="/canvas" style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
          Genesis
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border-1)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Templates</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px 64px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 8 }}>
              Templates
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Pre-built workflows — load instantly
            </p>
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
              <Label>Loading templates…</Label>
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
              <Card key={tmpl.name} variant="default">

                {/* Card header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge variant={CATEGORY_VARIANT[tmpl.category] ?? 'default'}>
                        {tmpl.category}
                      </Badge>
                      <Label>{tmpl.agent_count} agents</Label>
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                      {tmpl.display_name}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tmpl.description}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeploy(tmpl.name)}
                    disabled={deploying === tmpl.name}
                    style={{ flexShrink: 0 }}
                  >
                    {deploying === tmpl.name ? 'Deploying…' : 'Use Template'}
                  </Button>
                </div>

                {/* Intent preview */}
                <div style={{
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: 12,
                  background: 'var(--accent-dim)',
                  borderRadius: '0 4px 4px 0',
                  padding: '8px 12px',
                  marginBottom: 12,
                }}>
                  <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-text)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {tmpl.intent}
                  </p>
                </div>

                {/* Agent pills */}
                <CardBody>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <Label style={{ width: '100%', marginBottom: 4 }}>Agents</Label>
                    {tmpl.agents.map((agent) => (
                      <Badge key={agent} variant="default">
                        {agent}
                      </Badge>
                    ))}
                  </div>
                </CardBody>

              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
