'use client'

import { useEffect, useState } from 'react'
import {
  Button, Badge, Input, Textarea, Label, Divider, EmptyState,
} from '@/components/ui'
import { useGenesisStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { Workflow } from '@/lib/types'

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

export type MemoryType = 'none' | 'short_term' | 'long_term'

interface Guardrails {
  max_tokens: number
  max_iterations: number
  require_human_approval: boolean
}

interface InteractionRules {
  can_spawn_agents: boolean
  can_modify_workflow: boolean
}

const DEFAULT_GUARDRAILS: Guardrails = {
  max_tokens: 4096,
  max_iterations: 10,
  require_human_approval: false,
}

const DEFAULT_INTERACTION_RULES: InteractionRules = {
  can_spawn_agents: false,
  can_modify_workflow: false,
}

interface GraphNode {
  id: string
  system_prompt: string
  model_name: string
  tools: string[]
  schedule: string | null
  memory_type: MemoryType
  guardrails: Guardrails
  interaction_rules: InteractionRules
}

interface SectionProps { title: string; children: React.ReactNode; defaultOpen?: boolean }

function Section({ title, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between py-2 px-4 text-left hover:bg-surface-2 transition-colors duration-fast focus-visible:outline-none"
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

export function AgentConfigPanel({ workflow }: { workflow: Workflow | null }) {
  const selectedNodeId = useGenesisStore((s) => s.selectedNodeId)
  const updateNode = useGenesisStore((s) => s.updateNode)

  const [node, setNode] = useState<GraphNode | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // When selected node or workflow changes, extract node data from graph_json
  useEffect(() => {
    if (!selectedNodeId || !workflow) { setNode(null); setDirty(false); return }

    const graphJson = workflow.graph_json as { nodes?: GraphNode[] } | null
    const nodes = graphJson?.nodes ?? []
    const raw = nodes.find((n) => n.id === selectedNodeId) ?? null
    if (!raw) { setNode(null); setDirty(false); return }

    // Apply defaults for fields that may be absent in older graph_json docs
    const found: GraphNode = {
      ...raw,
      memory_type: (raw.memory_type as MemoryType | undefined) ?? 'none',
      guardrails: {
        ...DEFAULT_GUARDRAILS,
        ...(raw.guardrails as Partial<Guardrails> | undefined),
      },
      interaction_rules: {
        ...DEFAULT_INTERACTION_RULES,
        ...(raw.interaction_rules as Partial<InteractionRules> | undefined),
      },
    }
    setNode(found)
    setDirty(false)
    setSaveState('idle')
    setErrorMsg('')
  }, [selectedNodeId, workflow])

  function patch<K extends keyof GraphNode>(key: K, value: GraphNode[K]) {
    if (!node) return
    setNode({ ...node, [key]: value })
    setDirty(true)
    setSaveState('idle')
  }

  function toggleTool(tool: string) {
    if (!node) return
    const current = node.tools
    const next = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool]
    patch('tools', next)
  }

  async function handleSave() {
    if (!node || !workflow) return
    setSaving(true)
    setErrorMsg('')
    try {
      // Patch the graph_json in place
      const currentGraph = (workflow.graph_json ?? { nodes: [], edges: [] }) as { nodes: GraphNode[]; edges: unknown[] }
      const updatedNodes = currentGraph.nodes.map((n) =>
        n.id === node.id ? { ...n, ...node } : n
      )
      await api.updateWorkflow(workflow.id, {
        graph_json: { ...currentGraph, nodes: updatedNodes },
      })

      // Update canvas node label if name-like field changed
      updateNode(node.id, { label: node.id, model: node.model_name, tools: node.tools })
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

  // ── Empty states ─────────────────────────────────────────────────────────────

  if (!selectedNodeId) {
    return (
      <EmptyState
        icon="⬡"
        title="No agent selected"
        body="Click an agent node on the canvas to edit its system prompt, model, and tools"
        className="h-full"
      />
    )
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-sm text-text-tertiary text-center">Load a workflow to enable editing</p>
      </div>
    )
  }

  if (!node) {
    return (
      <EmptyState
        icon="?"
        title="Node not found"
        body={`No graph node with id "${selectedNodeId}"`}
        className="h-full"
      />
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-0 flex-shrink-0 bg-surface-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-text-primary truncate" title={node.id}>
            {node.id}
          </span>
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

        {/* 1. Model */}
        <Section title="Model">
          <FieldRow label="Model">
            <select
              value={node.model_name}
              onChange={(e) => patch('model_name', e.target.value)}
              className="w-full bg-surface-1 border border-border-2 rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-fast focus:border-border-3 focus:outline-none appearance-none"
            >
              {ALLOWED_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldRow>
        </Section>

        {/* 2. System Prompt */}
        <Section title="System Prompt">
          <Textarea
            mono
            value={node.system_prompt}
            onChange={(e) => patch('system_prompt', e.target.value)}
            rows={10}
            placeholder="You are a…"
          />
          <p className="text-xs text-text-tertiary">{node.system_prompt.length} chars</p>
        </Section>

        {/* 3. Tools */}
        <Section title="Tools">
          <div className="flex flex-col gap-2">
            {AVAILABLE_TOOLS.map((tool) => (
              <label key={tool} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={node.tools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                  className="sr-only"
                />
                <span className={[
                  'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors duration-fast',
                  node.tools.includes(tool)
                    ? 'bg-accent border-accent'
                    : 'bg-surface-2 border-border-2 group-hover:border-border-3',
                ].join(' ')}>
                  {node.tools.includes(tool) && (
                    <span className="text-text-inverse text-[10px] font-bold leading-none">✓</span>
                  )}
                </span>
                <span className="text-sm font-mono text-text-secondary">{tool}</span>
              </label>
            ))}
          </div>
          {node.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.tools.map((t) => <Badge key={t} variant="default">{t}</Badge>)}
            </div>
          )}
        </Section>

        {/* 4. Limits & Memory */}
        <Section title="Limits & Memory" defaultOpen={false}>

          {/* Memory type */}
          <FieldRow label="Memory type">
            <select
              value={node.memory_type}
              onChange={(e) => patch('memory_type', e.target.value as MemoryType)}
              className="w-full bg-surface-1 border border-border-2 rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-fast focus:border-border-3 focus:outline-none appearance-none"
            >
              <option value="none">No memory (stateless)</option>
              <option value="short_term">Short-term (recalls last 3 runs)</option>
              <option value="long_term">Long-term (recalls all past runs)</option>
            </select>
          </FieldRow>
          {node.memory_type !== 'none' && (
            <p className="text-xs text-text-tertiary">
              This agent will remember its conclusions and apply them to future runs.
            </p>
          )}

          {/* Guardrails */}
          <FieldRow label="Max output tokens">
            <Input
              type="number"
              value={String(node.guardrails.max_tokens)}
              onChange={(e) => patch('guardrails', {
                ...node.guardrails,
                max_tokens: Math.min(16384, Math.max(256, Number(e.target.value))),
              })}
              min={256}
              max={16384}
              step={256}
            />
          </FieldRow>

          <FieldRow label="Max tool call rounds">
            <Input
              type="number"
              value={String(node.guardrails.max_iterations)}
              onChange={(e) => patch('guardrails', {
                ...node.guardrails,
                max_iterations: Math.min(20, Math.max(1, Number(e.target.value))),
              })}
              min={1}
              max={20}
            />
          </FieldRow>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={node.guardrails.require_human_approval}
              onChange={(e) => patch('guardrails', {
                ...node.guardrails,
                require_human_approval: e.target.checked,
              })}
              className="sr-only"
            />
            <span className={[
              'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors duration-fast',
              node.guardrails.require_human_approval
                ? 'bg-accent border-accent'
                : 'bg-surface-2 border-border-2 group-hover:border-border-3',
            ].join(' ')}>
              {node.guardrails.require_human_approval && (
                <span className="text-text-inverse text-[10px] font-bold leading-none">✓</span>
              )}
            </span>
            <span className="text-sm text-text-secondary">Require human approval before acting</span>
          </label>

          {/* Interaction rules */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={node.interaction_rules.can_spawn_agents}
              onChange={(e) => patch('interaction_rules', {
                ...node.interaction_rules,
                can_spawn_agents: e.target.checked,
              })}
              className="sr-only"
            />
            <span className={[
              'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors duration-fast',
              node.interaction_rules.can_spawn_agents
                ? 'bg-accent border-accent'
                : 'bg-surface-2 border-border-2 group-hover:border-border-3',
            ].join(' ')}>
              {node.interaction_rules.can_spawn_agents && (
                <span className="text-text-inverse text-[10px] font-bold leading-none">✓</span>
              )}
            </span>
            <span className="text-sm text-text-secondary">Can spawn sub-agents</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={node.interaction_rules.can_modify_workflow}
              onChange={(e) => patch('interaction_rules', {
                ...node.interaction_rules,
                can_modify_workflow: e.target.checked,
              })}
              className="sr-only"
            />
            <span className={[
              'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors duration-fast',
              node.interaction_rules.can_modify_workflow
                ? 'bg-accent border-accent'
                : 'bg-surface-2 border-border-2 group-hover:border-border-3',
            ].join(' ')}>
              {node.interaction_rules.can_modify_workflow && (
                <span className="text-text-inverse text-[10px] font-bold leading-none">✓</span>
              )}
            </span>
            <span className="text-sm text-text-secondary">Can modify its own workflow</span>
          </label>

        </Section>

        {/* 5. Schedule */}
        <Section title="Schedule" defaultOpen={false}>
          <FieldRow label="Cron Expression">
            <Input
              mono
              value={node.schedule ?? ''}
              onChange={(e) => patch('schedule', e.target.value || null)}
              placeholder="0 9 * * 1-5  (weekdays 9am)"
            />
          </FieldRow>
          <p className="text-xs text-text-tertiary">
            Leave blank for on-demand execution.
          </p>
        </Section>

      </div>
    </div>
  )
}
