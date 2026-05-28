'use client'

import { useEffect, useRef } from 'react'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'
import type { AgentMessage, BuildLog } from '@/lib/types'

const TYPE_COLORS: Record<string, string> = {
  state_update:  '#3b9edd',
  tool_call:     '#f97316',
  tool_result:   '#22c55e',
  human_input:   '#a78bfa',
  agent_output:  '#adff2f',
}

const LOG_COLORS: Record<string, string> = {
  info:    '#a1a1a1',
  warning: '#f5a623',
  error:   '#ff4444',
  debug:   '#6e6e6e',
}

export function MonitorPanel() {
  const agentMessages = useGenesisStore((s) => s.agentMessages)
  const buildLogs = useGenesisStore((s) => s.buildLogs)
  const tokenUsage = useGenesisStore((s) => s.tokenUsage)
  const estimatedCost = useGenesisStore((s) => s.estimatedCost)
  const addAgentMessage = useGenesisStore((s) => s.addAgentMessage)
  const addBuildLog = useGenesisStore((s) => s.addBuildLog)
  const updateTokenUsage = useGenesisStore((s) => s.updateTokenUsage)
  const setEstimatedCost = useGenesisStore((s) => s.setEstimatedCost)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { subscribe } = useWebSocket()

  useEffect(() => {
    const unsubMsg = subscribe('agent_message', (payload) => {
      addAgentMessage(payload as AgentMessage)
    })
    const unsubLog = subscribe('build_log', (payload) => {
      addBuildLog(payload as BuildLog)
    })
    const unsubTokens = subscribe('token_usage', (payload) => {
      const p = payload as { agent: string; tokens: number; cost: number }
      updateTokenUsage(p.agent, p.tokens)
      setEstimatedCost(p.cost)
    })
    return () => { unsubMsg(); unsubLog(); unsubTokens() }
  }, [subscribe, addAgentMessage, addBuildLog, updateTokenUsage, setEstimatedCost])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentMessages, buildLogs])

  const totalTokens = Object.values(tokenUsage).reduce((a, b) => a + b, 0)

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
          Monitor
        </span>
      </div>

      {/* Token usage */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: '#6e6e6e' }}>
          {totalTokens.toLocaleString()} tokens
        </span>
        <span style={{ fontSize: 11, color: '#adff2f' }}>
          ${estimatedCost.toFixed(4)}
        </span>
      </div>

      {/* Build logs */}
      {buildLogs.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid #1a1a1a',
            maxHeight: 120,
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {buildLogs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: '4px 16px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: '#4a4a4a',
                  fontFamily: 'var(--font-mono, monospace)',
                  flexShrink: 0,
                  paddingTop: 1,
                }}
              >
                {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#6e6e6e',
                  flexShrink: 0,
                  width: 48,
                }}
              >
                {log.stage}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: LOG_COLORS[log.level] ?? '#a1a1a1',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Agent messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
        }}
      >
        {agentMessages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: 24,
            }}
          >
            <p style={{ fontSize: 12, color: '#6e6e6e', textAlign: 'center' }}>
              No activity yet
            </p>
          </div>
        ) : (
          agentMessages.map((msg) => (
            <div
              key={msg.id}
              style={{
                padding: '6px 16px',
                borderBottom: '1px solid #111111',
              }}
            >
              {/* Agents row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: '#ededed',
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {msg.from_agent}
                </span>
                <span style={{ fontSize: 9, color: '#4a4a4a' }}>→</span>
                <span
                  style={{
                    fontSize: 10,
                    color: '#a1a1a1',
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {msg.to_agent}
                </span>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: 9,
                    color: TYPE_COLORS[msg.type] ?? '#6e6e6e',
                    background: '#111111',
                    border: `1px solid #222222`,
                    borderRadius: 3,
                    padding: '1px 4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {msg.type.replace('_', ' ')}
                </span>
              </div>

              {/* Content */}
              <p
                style={{
                  fontSize: 11,
                  color: '#6e6e6e',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {msg.content}
              </p>

              {/* Timestamp */}
              <span
                style={{
                  fontSize: 9,
                  color: '#4a4a4a',
                  fontFamily: 'var(--font-mono, monospace)',
                  display: 'block',
                  marginTop: 3,
                }}
              >
                {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false })}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Per-agent token breakdown */}
      {Object.keys(tokenUsage).length > 0 && (
        <div
          style={{
            borderTop: '1px solid #1a1a1a',
            padding: '8px 16px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#4a4a4a',
            }}
          >
            Token breakdown
          </span>
          {Object.entries(tokenUsage).map(([agent, tokens]) => (
            <div
              key={agent}
              style={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <span style={{ fontSize: 10, color: '#6e6e6e' }}>{agent}</span>
              <span
                style={{
                  fontSize: 10,
                  color: '#a1a1a1',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {tokens.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
