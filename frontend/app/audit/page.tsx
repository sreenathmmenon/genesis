'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Nav } from '@/components/shared/Nav'
import { api } from '@/lib/api'
import type { AuditEntry } from '@/lib/types'

// ── Event metadata ─────────────────────────────────────────────────────────────

const EVENT_COLOR: Record<string, { dot: string; bg: string; border: string; text: string }> = {
  'workflow.created':        { dot: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  'workflow.deployed':       { dot: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  'workflow.paused':         { dot: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280' },
  'workflow.deleted':        { dot: '#EF4444', bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
  'workflow.schedule_set':   { dot: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  'workflow.schedule_removed':{ dot: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', text: '#6B7280' },
  'workflow.run_triggered':  { dot: '#D97706', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  'workflow.auto_repaired':  { dot: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  'run.started':             { dot: '#D97706', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  'run.completed':           { dot: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  'run.failed':              { dot: '#EF4444', bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
  'build.started':           { dot: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },
  'build.deployed':          { dot: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  'agent.config_changed':    { dot: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  'template.deployed':       { dot: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', text: '#0E7490' },
}

const DEFAULT_COLOR = { dot: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B' }

function eventColor(type: string) {
  return EVENT_COLOR[type] ?? DEFAULT_COLOR
}

function friendlyLabel(type: string): string {
  return type
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  if (h < 48) return 'yesterday'
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString('en', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── Entity type badge ──────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  workflow: '#2563EB',
  run: '#D97706',
  build: '#6366F1',
  agent: '#0891B2',
}

function EntityBadge({ type }: { type: string }) {
  const color = ENTITY_COLORS[type] ?? '#64748B'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      color, background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 3, padding: '1px 6px', flexShrink: 0, fontFamily: 'var(--font-mono)',
    }}>
      {type}
    </span>
  )
}

// ── Detail expander ────────────────────────────────────────────────────────────

function DetailCell({ detail }: { detail: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!detail || Object.keys(detail).length === 0) return <span style={{ color: '#CBD5E1' }}>—</span>

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, color: '#6B7280', background: '#F1F5F9',
          border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px',
          cursor: 'pointer', fontFamily: 'var(--font-mono)',
          transition: 'background 120ms',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#E2E8F0')}
        onMouseLeave={e => (e.currentTarget.style.background = '#F1F5F9')}
      >
        {open ? '▴ hide' : '▾ view'}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, fontSize: 11, color: '#374151', background: '#F8FAFC',
          border: '1px solid #E2E8F0', borderRadius: 4, padding: '8px 10px',
          fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', maxWidth: 320,
        }}>
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({
  eventTypes,
  activeType,
  activeEntity,
  search,
  onType,
  onEntity,
  onSearch,
  onClear,
}: {
  eventTypes: string[]
  activeType: string
  activeEntity: string
  search: string
  onType: (v: string) => void
  onEntity: (v: string) => void
  onSearch: (v: string) => void
  onClear: () => void
}) {
  const entities = ['workflow', 'run', 'build', 'agent']
  const hasFilter = activeType || activeEntity || search

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      <input
        type="text"
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search entity name…"
        style={{
          fontSize: 13, color: '#374151', background: '#FFFFFF',
          border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 12px',
          outline: 'none', fontFamily: 'inherit', width: 220,
          transition: 'border-color 150ms',
        }}
        onFocus={e => (e.target.style.borderColor = '#16A34A')}
        onBlur={e => (e.target.style.borderColor = '#E2E8F0')}
      />

      <select
        value={activeEntity}
        onChange={e => onEntity(e.target.value)}
        style={{
          fontSize: 12, color: '#374151', background: '#FFFFFF',
          border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 28px 7px 10px',
          outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
          appearance: 'none',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
        }}
      >
        <option value="">All entities</option>
        {entities.map(e => <option key={e} value={e}>{e}</option>)}
      </select>

      <select
        value={activeType}
        onChange={e => onType(e.target.value)}
        style={{
          fontSize: 12, color: '#374151', background: '#FFFFFF',
          border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 28px 7px 10px',
          outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
          appearance: 'none',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          maxWidth: 220,
        }}
      >
        <option value="">All event types</option>
        {eventTypes.map(t => <option key={t} value={t}>{friendlyLabel(t)}</option>)}
      </select>

      {hasFilter && (
        <button
          onClick={onClear}
          style={{
            fontSize: 12, color: '#6B7280', background: 'transparent',
            border: '1px solid #E2E8F0', borderRadius: 6, padding: '7px 12px',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 120ms',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#374151'; el.style.borderColor = '#D1D5DB' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#6B7280'; el.style.borderColor = '#E2E8F0' }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// ── Audit row ─────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const c = eventColor(entry.event_type)

  return (
    <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
      {/* Dot + event type */}
      <td style={{ padding: '12px 16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 1,
          }} />
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: c.text, background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 4, padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}>
            {friendlyLabel(entry.event_type)}
          </span>
        </div>
      </td>

      {/* Entity */}
      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <EntityBadge type={entry.entity_type} />
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
            {entry.entity_name || '—'}
          </span>
        </div>
        {entry.entity_id && (
          <div style={{ fontSize: 10, color: '#B0B7C3', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {entry.entity_id.slice(0, 8)}…
          </div>
        )}
      </td>

      {/* Detail */}
      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
        <DetailCell detail={entry.detail} />
      </td>

      {/* Timestamp */}
      <td style={{ padding: '12px 16px', verticalAlign: 'top', whiteSpace: 'nowrap', textAlign: 'right' }}>
        <span style={{ fontSize: 12, color: '#6B7280' }} title={absTime(entry.timestamp)}>
          {relativeTime(entry.timestamp)}
        </span>
        <div style={{ fontSize: 10, color: '#B0B7C3', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {absTime(entry.timestamp)}
        </div>
      </td>
    </tr>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const offsetRef = useRef(0)

  const load = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offsetRef.current
    if (reset) setLoading(true)
    try {
      const params: Parameters<typeof api.getAuditLogs>[0] = {
        limit: PAGE_SIZE,
        offset: newOffset,
      }
      if (filterType) params.event_type = filterType
      if (filterEntity) params.entity_type = filterEntity

      const data = await api.getAuditLogs(params) as { items: AuditEntry[]; limit: number; offset: number }
      if (reset) {
        setEntries(data.items)
        offsetRef.current = data.items.length
        setOffset(data.items.length)
      } else {
        setEntries(prev => [...prev, ...data.items])
        offsetRef.current = offsetRef.current + data.items.length
        setOffset(prev => prev + data.items.length)
      }
      setHasMore(data.items.length === PAGE_SIZE)
    } catch (err) {
      console.error(err)
    } finally {
      if (reset) setLoading(false)
    }
  }, [filterType, filterEntity])

  // Initial load + filter changes
  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterEntity])

  // Poll for new entries every 10s
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), 10_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterEntity])

  // Load distinct event types for filter dropdown
  useEffect(() => {
    api.getAuditEventTypes()
      .then(types => setEventTypes(types as string[]))
      .catch(console.error)
  }, [])

  const filtered = search
    ? entries.filter(e =>
        (e.entity_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        e.event_type.includes(search.toLowerCase()) ||
        (e.entity_id ?? '').includes(search.toLowerCase())
      )
    : entries

  function clearFilters() {
    setFilterType('')
    setFilterEntity('')
    setSearch('')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F8FA' }}>
      <Nav />
      <div className="page-content" style={{ paddingLeft: 220, flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", background: "#F6F8FC" }}>
        <div style={{ maxWidth: 1080, width: '100%', margin: '0 auto', padding: '36px 32px 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4, lineHeight: 1.2 }}>
              Audit Log
            </h1>
            <p style={{ fontSize: 14, color: '#6B7280' }}>
              Immutable record of every system event — workflow changes, agent runs, build deployments, config edits
            </p>
          </div>

          {/* Filters */}
          <FilterBar
            eventTypes={eventTypes}
            activeType={filterType}
            activeEntity={filterEntity}
            search={search}
            onType={setFilterType}
            onEntity={setFilterEntity}
            onSearch={setSearch}
            onClear={clearFilters}
          />

          {/* Table */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {loading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '64px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, opacity: 0.15, marginBottom: 14 }}>☁</div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  No audit events yet
                </p>
                <p style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 300, margin: '0 auto', lineHeight: 1.6 }}>
                  Events are recorded as you create, deploy, and run agent workflows.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', width: '30%' }}>
                      Event
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', width: '28%' }}>
                      Entity
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', width: '22%' }}>
                      Detail
                    </th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', width: '20%' }}>
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Load more */}
          {hasMore && !loading && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button
                onClick={() => load(false)}
                style={{
                  fontSize: 13, color: '#6B7280', background: '#FFFFFF',
                  border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 20px',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#F9FAFB'; el.style.borderColor = '#D1D5DB' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#FFFFFF'; el.style.borderColor = '#E5E7EB' }}
              >
                Load more
              </button>
            </div>
          )}

          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#B0B7C3' }}>
              Showing {filtered.length} event{filtered.length !== 1 ? 's' : ''}
              {search || filterType || filterEntity ? ' (filtered)' : ''}
              {' · '}auto-refreshes every 10s
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
