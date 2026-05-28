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
        <a href="/canvas" className="text-lg font-semibold text-accent tracking-tight">
          Genesis
        </a>
        <div className="w-px h-4 bg-border-1" />
        <span className="text-md font-medium text-text-primary">Templates</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[800px] mx-auto px-6 pt-10 pb-16">

          {/* Page header */}
          <div className="flex flex-col gap-2 mb-8">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
              Templates
            </h1>
            <p className="text-base text-text-secondary">
              Pre-built workflows — load instantly
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
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

          <div className="flex flex-col gap-4">
            {templates.map((tmpl) => (
              <Card key={tmpl.name} variant="default" className="flex flex-col gap-4">

                {/* Card header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={CATEGORY_VARIANT[tmpl.category] ?? 'default'}>
                        {tmpl.category}
                      </Badge>
                      <Label>{tmpl.agent_count} agents</Label>
                    </div>
                    <h2 className="text-lg font-semibold text-text-primary tracking-tight">
                      {tmpl.display_name}
                    </h2>
                    <p className="text-base text-text-secondary">{tmpl.description}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeploy(tmpl.name)}
                    disabled={deploying === tmpl.name}
                    className="flex-shrink-0"
                  >
                    {deploying === tmpl.name ? 'Deploying…' : 'Use Template'}
                  </Button>
                </div>

                {/* Intent preview */}
                <div className="border-l-2 border-accent pl-4 bg-accent-dim rounded-r-md py-2 pr-3">
                  <p className="text-sm font-mono text-accent-text italic leading-relaxed">
                    {tmpl.intent}
                  </p>
                </div>

                {/* Agent pills */}
                <CardBody>
                  <div className="flex flex-wrap gap-2">
                    <Label className="w-full mb-1">Agents</Label>
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
