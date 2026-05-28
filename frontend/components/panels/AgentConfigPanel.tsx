'use client'

import { useEffect, useState } from 'react'
import {
  Button, Badge, Input, Textarea, Label, Divider, EmptyState,
} from '@/components/ui'
import { useGenesisStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { Agent, MemoryType } from '@/lib/types'

const ALLOWED_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-1.5-pro',
] as const

const AVAILABLE_TOOLS = [
  'web_search',
  'github_api',
  'file_reader',
  'http_request',
  'telegram_send',
  'scheduler',
] as const

const MEMORY_OPTIONS: { value: MemoryType; label: string; description: string }[] = [
  { value: 'none',       label: 'None',       description: 'Stateless — no memory between runs' },
  { value: 'short_term', label: 'Short-term', description: 'Remembers within a single run' },
  { value: 'long_term',  label: 'Long-term',  description: 'Persists across runs via Qdrant' },
]

function nextCronRuns(expr: string, count = 3): string[] {
  // Minimal cron preview — parse simple "min hour * * day" patterns
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return []
    const [minPart, hourPart, , , weekdayPart] = parts
    if (!minPart || !hourPart || !weekdayPart) return []
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const now = new Date()
    const results: string[] = []
    let d = new Date(now)
    while (results.length < count) {
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
      const matchDay = weekdayPart === '*' || days[d.getDay()] === days[parseInt(weekdayPart, 10)]
      if (!matchDay) continue
      d.setHours(parseInt(hourPart, 10), parseInt(minPart, 10), 0, 0)
      results.push(d.toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
    }
    return results
  } catch {
    return []
  }
}

interface SectionProps { title: string; children: React.ReactNode; defaultOpen?: boolean }

function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between py-2 px-4 text-left hover:bg-surface-2 transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <Label>{title}</Label>
        <span className="text-text-tertiary text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {children}
        </div>
      )}
      <Divider className="my-0" />
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function AgentConfigPanel() {
  const selectedNodeId = useGenesisStore((s) => s.selectedNodeId)
  const updateNode = useGenesisStore((s) => s.updateNode)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!selectedNodeId) { setAgent(null); setDirty(false); return }
    setLoading(true)
    api.getAgents()
      .then((agents: Agent[]) => {
        const found = agents.find((a) => a.id === selectedNodeId) ?? null
        setAgent(found)
        setDirty(false)
      })
      .catch(() => setAgent(null))
      .finally(() => setLoading(false))
  }, [selectedNodeId])

  function patch<K extends keyof Agent>(key: K, value: Agent[K]) {
    if (!agent) return
    setAgent({ ...agent, [key]: value })
    setDirty(true)
    setSaveState('idle')
  }

  function toggleTool(tool: string) {
    if (!agent) return
    const current = agent.tools as string[]
    const next = current.includes(tool)
      ? current.filter((t) => t !== tool)
      : [...current, tool]
    patch('tools', next as Agent['tools'])
  }

  async function handleSave() {
    if (!agent) return
    setSaving(true)
    setErrorMsg('')
    try {
      const updated: Agent = await api.updateAgent(agent.id, {
        name: agent.name,
        role: agent.role,
        system_prompt: agent.system_prompt,
        model_name: agent.model_name,
        memory_type: agent.memory_type,
        tools: agent.tools,
        schedule: agent.schedule,
        guardrails: agent.guardrails,
      })
      setAgent(updated)
      updateNode(agent.id, { label: updated.name })
      setDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed')
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  // ── Empty states ────────────────────────────────────────────────────────────

  if (!selectedNodeId) {
    return (
      <EmptyState
        icon="⬡"
        title="No agent selected"
        body="Click an agent node on the canvas to configure it"
        className="h-full"
      />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Label>Loading…</Label>
      </div>
    )
  }

  if (!agent) {
    return (
      <EmptyState
        icon="?"
        title="Agent not found"
        body="This node doesn't have a matching agent record yet"
        className="h-full"
      />
    )
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const tools = agent.tools as string[]
  const guardrails = agent.guardrails as Record<string, unknown>
  const cronRuns = agent.schedule ? nextCronRuns(agent.schedule) : []

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-0 flex-shrink-0 bg-surface-1">
        <div className="flex items-center gap-2">
          <Label>Agent Config</Label>
          {dirty && <Badge variant="warning">unsaved</Badge>}
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
        </Button>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 px-3 py-2 bg-[var(--error-dim)] border border-[var(--error-border)] rounded-md">
          <p className="text-xs text-error">{errorMsg}</p>
        </div>
      )}

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">

        {/* 1. Identity */}
        <Section title="Identity">
          <FieldRow label="Name">
            <Input
              value={agent.name}
              onChange={(e) => patch('name', e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Role">
            <Input
              value={agent.role}
              onChange={(e) => patch('role', e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Model">
            <select
              value={agent.model_name}
              onChange={(e) => patch('model_name', e.target.value)}
              className="w-full bg-surface-1 border border-border-2 rounded-md px-3 py-2 text-base text-text-primary transition-colors duration-fast focus:border-border-3 focus:outline-none appearance-none"
            >
              {ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldRow>
        </Section>

        {/* 2. Behavior */}
        <Section title="Behavior">
          <FieldRow label="System Prompt">
            <Textarea
              mono
              value={agent.system_prompt}
              onChange={(e) => patch('system_prompt', e.target.value)}
              rows={6}
              placeholder="You are a…"
            />
          </FieldRow>
          <FieldRow label="Tools">
            <div className="flex flex-col gap-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={tools.includes(tool)}
                    onChange={() => toggleTool(tool)}
                    className="sr-only"
                  />
                  <span
                    className={[
                      'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors duration-fast',
                      tools.includes(tool)
                        ? 'bg-accent border-accent'
                        : 'bg-surface-2 border-border-2 group-hover:border-border-3',
                    ].join(' ')}
                  >
                    {tools.includes(tool) && (
                      <span className="text-text-inverse text-[10px] font-bold leading-none">✓</span>
                    )}
                  </span>
                  <span className="text-sm font-mono text-text-secondary">
                    {tool}
                  </span>
                </label>
              ))}
            </div>
          </FieldRow>
        </Section>

        {/* 3. Memory */}
        <Section title="Memory">
          <div className="flex flex-col gap-2">
            {MEMORY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="memory_type"
                  value={opt.value}
                  checked={agent.memory_type === opt.value}
                  onChange={() => patch('memory_type', opt.value)}
                  className="sr-only"
                />
                <span
                  className={[
                    'w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors duration-fast',
                    agent.memory_type === opt.value
                      ? 'border-accent'
                      : 'border-border-2 group-hover:border-border-3',
                  ].join(' ')}
                >
                  {agent.memory_type === opt.value && (
                    <span className="w-2 h-2 rounded-full bg-accent block" />
                  )}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm text-text-primary font-medium">{opt.label}</span>
                  <span className="text-xs text-text-tertiary">{opt.description}</span>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* 4. Schedule */}
        <Section title="Schedule">
          <FieldRow label="Cron Expression">
            <Input
              mono
              value={agent.schedule ?? ''}
              onChange={(e) => patch('schedule', e.target.value || null)}
              placeholder="0 8 * * 1"
            />
          </FieldRow>
          {cronRuns.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Next 3 runs</Label>
              {cronRuns.map((r, i) => (
                <span key={i} className="text-xs font-mono text-text-tertiary">
                  {r}
                </span>
              ))}
            </div>
          )}
          {agent.schedule && cronRuns.length === 0 && (
            <p className="text-xs text-error">Invalid cron expression</p>
          )}
        </Section>

        {/* 5. Guardrails */}
        <Section title="Guardrails">
          <FieldRow label="Token Budget">
            <Input
              type="number"
              value={String(guardrails.max_tokens ?? 5000)}
              onChange={(e) =>
                patch('guardrails', { ...guardrails, max_tokens: parseInt(e.target.value, 10) })
              }
              min="100"
              max="200000"
            />
          </FieldRow>
          <FieldRow label="Max Turns">
            <Input
              type="number"
              value={String(guardrails.max_iterations ?? 10)}
              onChange={(e) =>
                patch('guardrails', { ...guardrails, max_iterations: parseInt(e.target.value, 10) })
              }
              min="1"
              max="50"
            />
          </FieldRow>
          <FieldRow label="Rate Limit / Minute">
            <Input
              type="number"
              value={String(guardrails.rate_limit_per_minute ?? 10)}
              onChange={(e) =>
                patch('guardrails', { ...guardrails, rate_limit_per_minute: parseInt(e.target.value, 10) })
              }
              min="1"
              max="100"
            />
          </FieldRow>
          <FieldRow label="Banned Topics">
            <Input
              value={
                Array.isArray(guardrails.banned_topics)
                  ? (guardrails.banned_topics as string[]).join(', ')
                  : ''
              }
              onChange={(e) =>
                patch('guardrails', {
                  ...guardrails,
                  banned_topics: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="politics, religion"
            />
            {Array.isArray(guardrails.banned_topics) &&
              (guardrails.banned_topics as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(guardrails.banned_topics as string[]).map((t) => (
                    <Badge key={t} variant="error">{t}</Badge>
                  ))}
                </div>
              )}
          </FieldRow>
        </Section>

      </div>
    </div>
  )
}
