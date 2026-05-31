'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/shared/Nav'
import { api } from '@/lib/api'
import type { Run, RunOutput, Message } from '@/lib/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function absTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function msgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function humanizeNodeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
    completed: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0', label: 'Completed' },
    failed:    { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Failed' },
    running:   { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'Running' },
    cancelled: { bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB', label: 'Cancelled' },
  }
  const s = map[status] ?? { bg: '#F9FAFB', color: '#6B7280', border: '#E5E7EB', label: status }
  return (
    <span style={{
      fontSize: 13, fontWeight: 500,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 6, padding: '4px 12px',
    }}>
      {s.label}
    </span>
  )
}

// ── Reasoning trace ───────────────────────────────────────────────────────────

function TraceStep({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)

  if (msg.message_type === 'state_update') {
    const agentName = msg.content.replace(/^Agent '(.+)' started$/, '$1') || msg.sender_agent
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366F1', flexShrink: 0, marginTop: 3 }} />
          <div style={{ width: 1, flex: 1, background: '#E5E7EB', marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
              {humanizeNodeId(agentName)}
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{msgTime(msg.timestamp)}</span>
          </div>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Starting...</span>
        </div>
      </div>
    )
  }

  if (msg.message_type === 'tool_call') {
    const toolContent = msg.content.slice(0, 120)
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0', paddingLeft: 28 }}>
        <span style={{ fontSize: 13, color: '#7C3AED', flexShrink: 0, marginTop: 1 }}>⚙</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>
              <span style={{ fontWeight: 600, color: '#7C3AED' }}>Called: </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: '#F3F0FF', color: '#5B21B6', padding: '1px 6px', borderRadius: 4 }}>
                {toolContent}
              </span>
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{msgTime(msg.timestamp)}</span>
          </div>
        </div>
      </div>
    )
  }

  if (msg.message_type === 'tool_result') {
    const text = msg.content
    const isLong = text.length > 200
    const display = isLong && !expanded ? text.slice(0, 200) + '…' : text
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0', paddingLeft: 28 }}>
        <span style={{ fontSize: 13, color: '#16A34A', flexShrink: 0, marginTop: 1 }}>✓</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>Result:</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{msgTime(msg.timestamp)}</span>
          </div>
          <p style={{
            fontSize: 12, color: '#374151', lineHeight: 1.6,
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 6, padding: '8px 10px',
          }}>
            {display}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (msg.message_type === 'agent_output' && msg.sender_agent !== 'executor') {
    const text = msg.content
    const isLong = text.length > 300
    const display = isLong && !expanded ? text.slice(0, 300) + '…' : text
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', paddingLeft: 28 }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💡</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#B45309' }}>Concluded:</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{msgTime(msg.timestamp)}</span>
          </div>
          <p style={{
            fontSize: 13, color: '#111827', lineHeight: 1.75,
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {display}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}

function ReasoningTrace({ messages }: { messages: Message[] }) {
  const traceMessages = messages.filter(m => m.sender_agent !== 'executor')

  if (traceMessages.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10 }}>
          Reasoning trace
        </div>
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '20px 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
            No trace available for this run — older runs don&apos;t have detailed traces.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10 }}>
        Reasoning trace · {traceMessages.length} steps
      </div>
      <div style={{
        background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
        padding: '16px 20px',
      }}>
        {traceMessages.map((msg, i) => (
          <TraceStep key={i} msg={msg} />
        ))}
      </div>
    </div>
  )
}

// ── Agent output card ──────────────────────────────────────────────────────────

function AgentOutputCard({ agent, content, index }: { agent: string; content: string; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const isLong = content.length > 300

  const label = humanizeNodeId(agent)

  return (
    <div style={{
      border: '1px solid #E5E7EB',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#FFFFFF',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '12px 16px',
          background: '#F9FAFB', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
          borderBottom: expanded ? '1px solid #E5E7EB' : 'none',
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 6,
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#2563EB', flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}>
          {(index + 1)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          {content.length.toLocaleString()} chars {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          <p style={{
            fontSize: 13, color: '#374151', lineHeight: 1.75,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
          }}>
            {isLong && !expanded ? content.slice(0, 300) + '…' : content}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Download button ────────────────────────────────────────────────────────────

function DownloadMenu({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false)

  const formats = [
    { fmt: 'text', label: 'Plain text (.txt)', icon: '📄' },
    { fmt: 'json', label: 'JSON (.json)', icon: '{ }' },
    { fmt: 'csv',  label: 'CSV (.csv)',  icon: '📊' },
  ] as const

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 500,
          background: '#FFFFFF', color: '#374151',
          border: '1px solid #E5E7EB', borderRadius: 7,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'background 150ms, border-color 150ms',
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#F9FAFB'; el.style.borderColor = '#D1D5DB' }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#FFFFFF'; el.style.borderColor = '#E5E7EB' }}
      >
        ↓ Download
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 20,
            minWidth: 200, overflow: 'hidden',
          }}>
            {formats.map(({ fmt, label, icon }) => (
              <a
                key={fmt}
                href={`${API_BASE}/api/v1/runs/${runId}/download?fmt=${fmt}`}
                download
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', fontSize: 13, color: '#374151',
                  textDecoration: 'none', transition: 'background 120ms',
                  borderBottom: fmt !== 'csv' ? '1px solid #F3F4F6' : 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 14 }}>{icon}</span>
                {label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Webhook config strip ───────────────────────────────────────────────────────

function WebhookStrip({ workflowId, currentUrl }: { workflowId: string; currentUrl: string | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.updateWorkflow(workflowId, { webhook_url: value.trim() || null })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Webhook output</span>
        {currentUrl && !editing && (
          <span style={{ fontSize: 11, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, padding: '1px 6px' }}>
            Active
          </span>
        )}
        {saved && (
          <span style={{ fontSize: 11, color: '#16A34A' }}>✓ Saved</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditing(e => !e)}
          style={{
            fontSize: 12, color: '#6B7280', background: 'transparent',
            border: '1px solid #E2E8F0', borderRadius: 4, padding: '3px 10px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {editing ? 'Cancel' : currentUrl ? 'Edit' : '+ Add webhook'}
        </button>
      </div>

      {!editing && currentUrl && (
        <span style={{ fontSize: 12, color: '#6B7280', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
          {currentUrl}
        </span>
      )}

      {!editing && !currentUrl && (
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0, lineHeight: 1.6 }}>
          Every time this agent runs, Genesis will POST the full output to your URL — works with n8n, Make.com, Zapier, your own API, or any HTTPS endpoint.
        </p>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="https://your-app.com/webhook or https://hook.eu1.make.com/..."
            style={{
              flex: 1, fontSize: 12, color: '#374151', background: '#FFFFFF',
              border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 10px',
              outline: 'none', fontFamily: 'var(--font-mono)',
            }}
            onFocus={e => (e.target.style.borderColor = '#16A34A')}
            onBlur={e => (e.target.style.borderColor = '#E2E8F0')}
          />
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 500,
              background: '#16A34A', color: '#FFFFFF', border: 'none',
              borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.id as string

  const [run, setRun] = useState<Run | null>(null)
  const [output, setOutput] = useState<RunOutput | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [workflowName, setWorkflowName] = useState('')
  const [workflowWebhook, setWorkflowWebhook] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rerunning, setRerunning] = useState(false)

  useEffect(() => {
    if (!runId) return
    Promise.all([
      api.getRun(runId),
      api.getRunOutput(runId),
      api.getMessages(runId),
    ]).then(([r, o, msgs]) => {
      const run = r as Run
      const out = o as RunOutput
      setRun(run)
      setOutput(out)
      setMessages(msgs as Message[])

      api.getWorkflow(run.workflow_id).then(wf => {
        const w = wf as { name: string; webhook_url: string | null }
        setWorkflowName(w.name)
        setWorkflowWebhook(w.webhook_url)
      }).catch(() => {})
    }).catch(console.error).finally(() => setLoading(false))
  }, [runId])

  const handleRerun = useCallback(async () => {
    setRerunning(true)
    try {
      const result = await api.rerunRun(runId) as { run_id: string }
      router.push(`/runs/${result.run_id}`)
    } catch (err) {
      console.error(err)
      setRerunning(false)
    }
  }, [runId, router])

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
        <Nav />
        <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>Loading run…</span>
        </div>
      </div>
    )
  }

  if (!run) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
        <Nav />
        <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: '#DC2626' }}>Run not found</span>
        </div>
      </div>
    )
  }

  const agentOutputEntries = Object.entries(output?.agent_outputs ?? {})
  const succeeded = run.status === 'completed'
  const failed = run.status === 'failed'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content">
        <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '36px 32px 80px' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: '#9CA3AF' }}>
            <Link href="/workflows" style={{ color: '#9CA3AF', textDecoration: 'none' }}>My Agents</Link>
            <span>/</span>
            <Link href={`/canvas?workflow_id=${run.workflow_id}`} style={{ color: '#9CA3AF', textDecoration: 'none' }}>
              {workflowName || 'Workflow'}
            </Link>
            <span>/</span>
            <span style={{ color: '#374151', fontFamily: 'var(--font-mono)' }}>{runId.slice(0, 8)}</span>
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1.3 }}>
                {workflowName || 'Agent Run'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={run.status} />
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {relativeTime(run.started_at)} · {absTime(run.started_at)}
                </span>
                {output?.duration_seconds && (
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {output.duration_seconds}s
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleRerun}
                disabled={rerunning}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  background: rerunning ? '#F9FAFB' : '#FFFFFF',
                  color: rerunning ? '#9CA3AF' : '#374151',
                  border: '1px solid #E5E7EB', borderRadius: 7,
                  cursor: rerunning ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { if (!rerunning) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#16A34A'; el.style.color = '#16A34A' } }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#E5E7EB'; el.style.color = '#374151' }}
              >
                {rerunning ? (
                  <>
                    <span style={{ width: 10, height: 10, border: '1.5px solid #D1D5DB', borderTopColor: '#6B7280', borderRadius: '50%', animation: 'spin 500ms linear infinite', display: 'inline-block' }} />
                    Running…
                  </>
                ) : '↺ Rerun'}
              </button>
              {output && <DownloadMenu runId={runId} />}
            </div>
          </div>

          {/* Summary card — the main output */}
          {(() => {
            const summaryText = output?.summary
              || (agentOutputEntries.length > 0
                ? agentOutputEntries.find(([, v]) => v?.trim())?.[1] ?? null
                : null)
            const displayText = summaryText ?? 'Run completed — no summary available.'
            const isFallback = !output?.summary
            return (
              <div style={{
                background: succeeded ? '#FAFFFE' : failed ? '#FFFAFA' : '#FFFFFF',
                border: `1px solid ${succeeded ? '#BBF7D0' : failed ? '#FECACA' : '#E5E7EB'}`,
                borderRadius: 10,
                padding: '20px 24px',
                marginBottom: 20,
                boxShadow: succeeded ? '0 2px 8px rgba(22,163,74,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10 }}>
                  Output
                </div>
                <p style={{ fontSize: 14, color: isFallback ? '#9CA3AF' : '#111827', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: isFallback && !summaryText ? 'italic' : 'normal' }}>
                  {displayText}
                </p>
              </div>
            )
          })()}

          {/* Error */}
          {failed && run.error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
              padding: '14px 16px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#DC2626', marginBottom: 6 }}>Error</div>
              <p style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {run.error}
              </p>
            </div>
          )}

          {/* Reasoning trace — primary content */}
          <ReasoningTrace messages={messages} />

          {/* Per-agent outputs */}
          {agentOutputEntries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10 }}>
                Agent outputs · {agentOutputEntries.length} agents
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agentOutputEntries.map(([agent, content], i) => (
                  <AgentOutputCard key={agent} agent={agent} content={content} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Webhook config */}
          <div style={{ marginBottom: 20 }}>
            <WebhookStrip workflowId={run.workflow_id} currentUrl={workflowWebhook} />
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20,
          }}>
            {[
              { label: 'Tokens', value: run.token_count_total.toLocaleString() },
              { label: 'Cost', value: `$${Number(run.estimated_cost_usd).toFixed(4)}` },
              { label: 'Started', value: absTime(run.started_at) },
              { label: 'Completed', value: absTime(run.completed_at) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
                padding: '12px 16px', flex: 1, minWidth: 120,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', fontFamily: label === 'Tokens' || label === 'Cost' ? 'var(--font-mono)' : 'inherit' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
