'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge, EmptyState, Label, StatusDot } from '@/components/ui'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'
import type { AgentMessage, BuildLog } from '@/lib/types'

const STAGE_EMOJI: Record<string, string> = {
  architecting:      '🔍',
  decomposing:       '🔨',
  building:          '🏗',
  reviewing:         '🔄',
  validating:        '✅',
  awaiting_approval: '⏳',
  deployed:          '🚀',
}

type MsgVariant = 'default' | 'accent' | 'info' | 'success' | 'ops'
const MSG_BADGE: Record<string, MsgVariant> = {
  state_update: 'info',
  tool_call:    'default',
  tool_result:  'success',
  human_input:  'ops',
  agent_output: 'accent',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function BuildLogTab({ logs }: { logs: BuildLog[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs.length])

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="🏗"
        title="Build log empty"
        body="Build log will appear here when you start a build"
        style={{ height: '100%', paddingTop: 48, paddingBottom: 48 }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: '100%' }}>
      {logs.map((log) => (
        <div
          key={log.id}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border-0)' }}
        >
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 2 }} aria-hidden>
            {STAGE_EMOJI[log.stage] ?? '·'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Label>{log.stage}</Label>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {fmtTime(log.timestamp)}
              </span>
            </div>
            <p style={{
              fontSize: 13,
              lineHeight: 1.4,
              wordBreak: 'break-word',
              color: log.level === 'error' ? 'var(--error)' : log.level === 'warning' ? 'var(--warning)' : 'var(--text-secondary)',
            }}>
              {log.message}
            </p>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function MessagesTab({ messages }: { messages: AgentMessage[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  if (messages.length === 0) {
    return (
      <EmptyState
        icon="💬"
        title="No messages yet"
        body="Agent messages appear here during builds"
        style={{ height: '100%', paddingTop: 48, paddingBottom: 48 }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: '100%' }}>
      {messages.map((msg) => {
        const expanded = expandedId === msg.id
        return (
          <button
            key={msg.id}
            onClick={() => setExpandedId(expanded ? null : msg.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-0)',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
                {msg.from_agent}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
                {msg.to_agent}
              </span>
              <div style={{ flex: 1 }} />
              <Badge variant={MSG_BADGE[msg.type] ?? 'default'}>
                {msg.type.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, wordBreak: 'break-word', textAlign: 'left', width: '100%' }}>
              {expanded ? msg.content : msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content}
            </p>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', alignSelf: 'flex-end' }}>
              {fmtTime(msg.timestamp)}
            </span>
          </button>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

function TokensTab({ tokenUsage, estimatedCost }: { tokenUsage: Record<string, number>; estimatedCost: number }) {
  const entries = Object.entries(tokenUsage)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No token usage yet"
        body="Token usage appears here when workflows run"
        style={{ height: '100%', paddingTop: 48, paddingBottom: 48 }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label>Total tokens</Label>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{total.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <Label>Est. cost</Label>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)' }}>${estimatedCost.toFixed(4)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
        {entries.sort(([, a], [, b]) => b - a).map(([agent, tokens]) => (
          <div
            key={agent}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-0)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{agent}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', flexShrink: 0 }}>{tokens.toLocaleString()}</span>
            </div>
            <div style={{ height: 2, width: '100%', background: 'var(--border-1)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{ height: '100%', background: 'var(--accent)', width: `${Math.round((tokens / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MonitorPanel() {
  const [active, setActive] = useState<'log' | 'messages' | 'tokens'>('log')
  const agentMessages = useGenesisStore((s) => s.agentMessages)
  const buildLogs = useGenesisStore((s) => s.buildLogs)
  const tokenUsage = useGenesisStore((s) => s.tokenUsage)
  const estimatedCost = useGenesisStore((s) => s.estimatedCost)
  const addAgentMessage = useGenesisStore((s) => s.addAgentMessage)
  const addBuildLog = useGenesisStore((s) => s.addBuildLog)
  const updateTokenUsage = useGenesisStore((s) => s.updateTokenUsage)
  const setEstimatedCost = useGenesisStore((s) => s.setEstimatedCost)
  const setBuildStatus = useGenesisStore((s) => s.setBuildStatus)
  const isBuilding = useGenesisStore((s) => s.isBuilding)

  const { subscribe } = useWebSocket()

  useEffect(() => {
    const u1 = subscribe('agent_message', (p) => addAgentMessage(p as AgentMessage))
    const u2 = subscribe('build_progress', (p) => {
      const payload = p as BuildLog & { status?: string; action?: string }
      addBuildLog(payload as BuildLog)
      // Keep toolbar status in sync
      if (payload?.status) setBuildStatus(payload.status)
      if (payload?.action === 'deployed') setBuildStatus('deployed')
    })
    const u3 = subscribe('monitor_update', (p) => {
      const { agent, tokens, cost } = p as { agent: string; tokens: number; cost: number }
      updateTokenUsage(agent, tokens)
      setEstimatedCost(cost)
    })
    return () => { u1(); u2(); u3() }
  }, [subscribe, addAgentMessage, addBuildLog, updateTokenUsage, setEstimatedCost, setBuildStatus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-0)', flexShrink: 0 }}>
        <Label>Monitor</Label>
        {isBuilding && <StatusDot state="building" />}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          onClick={() => setActive('log')}
          className={`tab${active === 'log' ? ' tab--active' : ''}`}
        >
          Build Log
        </button>
        <button
          onClick={() => setActive('messages')}
          className={`tab${active === 'messages' ? ' tab--active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          Messages
          {agentMessages.length > 0 && (
            <Badge variant="default">{agentMessages.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setActive('tokens')}
          className={`tab${active === 'tokens' ? ' tab--active' : ''}`}
        >
          Tokens
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {active === 'log' && <BuildLogTab logs={buildLogs} />}
        {active === 'messages' && <MessagesTab messages={agentMessages} />}
        {active === 'tokens' && <TokensTab tokenUsage={tokenUsage} estimatedCost={estimatedCost} />}
      </div>

    </div>
  )
}
