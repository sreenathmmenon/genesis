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
        className="h-full py-12"
      />
    )
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-2 px-4 py-2 border-b border-border-0 hover:bg-surface-2 transition-colors duration-fast"
        >
          <span className="text-base flex-shrink-0 mt-0.5" aria-hidden>
            {STAGE_EMOJI[log.stage] ?? '·'}
          </span>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Label>{log.stage}</Label>
              <span className="text-xs font-mono text-text-tertiary flex-shrink-0">
                {fmtTime(log.timestamp)}
              </span>
            </div>
            <p className={[
              'text-base leading-snug break-words',
              log.level === 'error' ? 'text-error' : log.level === 'warning' ? 'text-warning' : 'text-text-secondary',
            ].join(' ')}>
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
        className="h-full py-12"
      />
    )
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      {messages.map((msg) => {
        const expanded = expandedId === msg.id
        return (
          <button
            key={msg.id}
            onClick={() => setExpandedId(expanded ? null : msg.id)}
            className="flex flex-col gap-2 px-4 py-3 border-b border-border-0 hover:bg-surface-2 transition-colors duration-fast text-left focus-visible:outline-none w-full"
          >
            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="text-sm font-medium text-text-primary truncate max-w-[70px]">
                {msg.from_agent}
              </span>
              <span className="text-xs text-text-tertiary flex-shrink-0">→</span>
              <span className="text-sm text-text-secondary truncate max-w-[70px]">
                {msg.to_agent}
              </span>
              <div className="flex-1" />
              <Badge variant={MSG_BADGE[msg.type] ?? 'default'}>
                {msg.type.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-text-tertiary leading-snug break-words text-left w-full">
              {expanded ? msg.content : msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content}
            </p>
            <span className="text-xs font-mono text-text-tertiary self-end">
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
        className="h-full py-12"
      />
    )
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-1 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <Label>Total tokens</Label>
          <span className="text-md font-medium text-text-primary">{total.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <Label>Est. cost</Label>
          <span className="text-md font-medium text-accent">${estimatedCost.toFixed(4)}</span>
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-y-auto">
        {entries.sort(([, a], [, b]) => b - a).map(([agent, tokens]) => (
          <div
            key={agent}
            className="flex flex-col gap-2 px-4 py-3 border-b border-border-0 hover:bg-surface-2 transition-colors duration-fast"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary truncate max-w-[140px]">{agent}</span>
              <span className="text-sm font-mono text-text-primary flex-shrink-0">{tokens.toLocaleString()}</span>
            </div>
            <div className="h-px w-full bg-border-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-normal"
                style={{ width: `${Math.round((tokens / max) * 100)}%` }}
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
  const isBuilding = useGenesisStore((s) => s.isBuilding)

  const { subscribe } = useWebSocket()

  useEffect(() => {
    const u1 = subscribe('agent_message', (p) => addAgentMessage(p as AgentMessage))
    const u2 = subscribe('build_progress', (p) => addBuildLog(p as BuildLog))
    const u3 = subscribe('monitor_update', (p) => {
      const { agent, tokens, cost } = p as { agent: string; tokens: number; cost: number }
      updateTokenUsage(agent, tokens)
      setEstimatedCost(cost)
    })
    return () => { u1(); u2(); u3() }
  }, [subscribe, addAgentMessage, addBuildLog, updateTokenUsage, setEstimatedCost])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-0 flex-shrink-0">
        <Label>Monitor</Label>
        {isBuilding && <StatusDot state="building" />}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-1 flex-shrink-0">
        {(['log', 'messages', 'tokens'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={[
              'px-4 py-3 text-sm font-medium whitespace-nowrap select-none',
              'border-b-2 -mb-px cursor-pointer transition-colors duration-fast',
              'focus-visible:outline-none',
              active === tab
                ? 'text-text-primary border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary',
            ].join(' ')}
          >
            {tab === 'log' && 'Build Log'}
            {tab === 'messages' && (
              <span className="flex items-center gap-2">
                Messages
                {agentMessages.length > 0 && (
                  <Badge variant="default">{agentMessages.length}</Badge>
                )}
              </span>
            )}
            {tab === 'tokens' && 'Tokens'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {active === 'log' && <BuildLogTab logs={buildLogs} />}
        {active === 'messages' && <MessagesTab messages={agentMessages} />}
        {active === 'tokens' && <TokensTab tokenUsage={tokenUsage} estimatedCost={estimatedCost} />}
      </div>

    </div>
  )
}
