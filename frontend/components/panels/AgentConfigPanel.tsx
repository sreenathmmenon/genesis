'use client'

import { useEffect, useState } from 'react'
import { useGenesisStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { Agent } from '@/lib/types'

const MEMORY_OPTIONS = ['none', 'short_term', 'long_term'] as const

export function AgentConfigPanel() {
  const selectedNodeId = useGenesisStore((s) => s.selectedNodeId)
  const updateNode = useGenesisStore((s) => s.updateNode)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!selectedNodeId) { setAgent(null); return }
    api.getAgents().then((agents: Agent[]) => {
      const found = agents.find((a) => a.id === selectedNodeId)
      if (found) setAgent(found)
    }).catch(console.error)
  }, [selectedNodeId])

  function patch<K extends keyof Agent>(key: K, value: Agent[K]) {
    if (!agent) return
    setAgent({ ...agent, [key]: value })
    setDirty(true)
  }

  async function handleSave() {
    if (!agent) return
    setSaving(true)
    try {
      const updated: Agent = await api.updateAgent(agent.id, {
        name: agent.name,
        system_prompt: agent.system_prompt,
        model_name: agent.model_name,
        memory_type: agent.memory_type,
      })
      setAgent(updated)
      updateNode(agent.id, { label: updated.name })
      setDirty(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (!selectedNodeId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 8,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.15 }}>⬡</div>
        <p style={{ fontSize: 12, color: '#6e6e6e' }}>
          Click an agent node to configure it
        </p>
      </div>
    )
  }

  if (!agent) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6e6e6e' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#6e6e6e',
          }}
        >
          Agent Config
        </span>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#adff2f',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 5,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* Fields */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Field label="Name">
          <input
            value={agent.name}
            onChange={(e) => patch('name', e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Role">
          <input
            value={agent.role}
            readOnly
            style={{ ...inputStyle, color: '#6e6e6e', cursor: 'default' }}
          />
        </Field>

        <Field label="Model">
          <input
            value={agent.model_name}
            onChange={(e) => patch('model_name', e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Memory">
          <select
            value={agent.memory_type}
            onChange={(e) => patch('memory_type', e.target.value as Agent['memory_type'])}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            {MEMORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
            ))}
          </select>
        </Field>

        <Field label="System Prompt">
          <textarea
            value={agent.system_prompt}
            onChange={(e) => patch('system_prompt', e.target.value)}
            rows={6}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: 80,
              lineHeight: 1.5,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
            }}
          />
        </Field>

        <Field label="Tools">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.tools.length === 0 && (
              <span style={{ fontSize: 11, color: '#4a4a4a' }}>No tools</span>
            )}
            {agent.tools.map((tool) => (
              <span
                key={String(tool)}
                style={{
                  fontSize: 10,
                  color: '#6e6e6e',
                  background: '#161616',
                  border: '1px solid #222222',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {String(tool)}
              </span>
            ))}
          </div>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#6e6e6e',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#111111',
  border: '1px solid #2e2e2e',
  borderRadius: 5,
  padding: '6px 10px',
  color: '#ededed',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
}
