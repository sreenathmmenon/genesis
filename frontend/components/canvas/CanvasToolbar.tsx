'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Label, StatusDot } from '@/components/ui'
import { useGenesisStore } from '@/lib/store'
import { useWebSocket } from '@/lib/websocket'
import { api } from '@/lib/api'

const BUILD_STAGES = ['Analyzing', 'Designing', 'Building', 'Reviewing', 'Validating', 'Ready']

const STATUS_DOT_MAP: Record<string, 'active' | 'idle' | 'error' | 'building' | 'info'> = {
  idle:               'idle',
  decomposing:        'building',
  building:           'building',
  critiquing:         'info',
  validating:         'info',
  awaiting_approval:  'active',
  deployed:           'active',
  failed:             'error',
}

const STAGE_FROM_STATUS: Record<string, number> = {
  decomposing: 0, building: 2, critiquing: 3, validating: 4,
  awaiting_approval: 5, deployed: 5,
}

interface CanvasToolbarProps {
  workflowName?: string
  onNewBuild?: () => void
}

export function CanvasToolbar({ workflowName, onNewBuild }: CanvasToolbarProps) {
  const buildStatus = useGenesisStore((s) => s.buildStatus)
  const isBuilding = useGenesisStore((s) => s.isBuilding)
  const currentBuildId = useGenesisStore((s) => s.currentBuildId)
  const setBuilding = useGenesisStore((s) => s.setBuilding)
  const setBuildStatus = useGenesisStore((s) => s.setBuildStatus)
  const clearCanvas = useGenesisStore((s) => s.clearCanvas)
  const nodeCount = useGenesisStore((s) => s.nodes.length)
  const edgeCount = useGenesisStore((s) => s.edges.length)

  const { connected } = useWebSocket()
  const dotState = STATUS_DOT_MAP[buildStatus] ?? 'idle'
  const stageIndex = STAGE_FROM_STATUS[buildStatus] ?? -1

  // A build is ready to deploy once it reaches awaiting_approval. `isBuilding`
  // isn't reliably cleared by the progress stream, so key the UI off the status.
  const awaitingApproval = buildStatus === 'awaiting_approval'
  const showBuildingProgress = isBuilding && !awaitingApproval

  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState('')

  async function handleDeploy() {
    if (!currentBuildId) { setDeployError('No build to deploy'); return }
    setDeploying(true)
    setDeployError('')
    try {
      await api.deployBuild(currentBuildId)
      setBuilding(false)
      setBuildStatus('deployed')
      // The canvas navigates to the deployed workflow via the build_progress
      // 'deployed' event already wired up in the page; nothing else needed here.
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="layout-toolbar">

      {/* Brand */}
      <Link href="/" style={{ fontWeight: 700, fontSize: 15, color: '#111827', letterSpacing: '-0.02em', flexShrink: 0, textDecoration: 'none' }}>
        Genesis
      </Link>

      <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />

      {/* Workflow name */}
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {workflowName ?? 'New Workflow'}
      </span>

      {/* Build stage progress dots — only while actively building */}
      {showBuildingProgress && stageIndex >= 0 && (
        <>
          <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {BUILD_STAGES.map((stage, i) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: i <= stageIndex ? '#16A34A' : '#D1D5DB',
                  opacity: i === stageIndex ? 1 : 0.7,
                }} />
                <span style={{
                  fontSize: 12,
                  color: i === stageIndex ? '#111827' : '#6B7280',
                  fontWeight: i === stageIndex ? 500 : 400,
                }}>
                  {stage}
                </span>
                {i < BUILD_STAGES.length - 1 && (
                  <span style={{ fontSize: 12, color: '#D1D5DB' }}>·</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Status label when idle / done (not while awaiting approval — that
          state gets its own labelled Deploy action on the right instead) */}
      {!showBuildingProgress && !awaitingApproval && buildStatus !== 'idle' && (
        <>
          <div style={{ width: 1, height: 16, background: '#E5E7EB', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot state={dotState} />
            <Label>{buildStatus.replace(/_/g, ' ')}</Label>
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Deploy call-to-action — shown when a build is ready for approval */}
      {awaitingApproval && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {deployError && (
            <span style={{ fontSize: 12, color: '#DC2626' }}>{deployError}</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F97316', flexShrink: 0 }} />
            <Label>Ready to deploy</Label>
          </div>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 16px',
              background: deploying ? '#F1F5F9' : '#16A34A',
              color: deploying ? '#94A3B8' : '#FFFFFF',
              border: '1px solid', borderColor: deploying ? '#E2E8F0' : 'transparent',
              borderRadius: 7, fontSize: 13, fontWeight: 600,
              cursor: deploying ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 150ms', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!deploying) (e.currentTarget as HTMLElement).style.background = '#15803D' }}
            onMouseLeave={e => { if (!deploying) (e.currentTarget as HTMLElement).style.background = '#16A34A' }}
          >
            {deploying ? (
              <>
                <span style={{
                  width: 12, height: 12,
                  border: '2px solid rgba(0,0,0,0.1)', borderTopColor: '#94A3B8',
                  borderRadius: '50%', animation: 'spin 600ms linear infinite',
                  display: 'inline-block', flexShrink: 0,
                }} />
                Deploying…
              </>
            ) : '🚀 Deploy agent'}
          </button>
        </div>
      )}

      {/* Graph stats */}
      {nodeCount > 0 && (
        <Label style={{ flexShrink: 0 }}>
          {nodeCount} agents · {edgeCount} edges
        </Label>
      )}

      {nodeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearCanvas}>
          Clear
        </Button>
      )}

      <a href="/workflows" className="btn btn--ghost btn--sm">
        My Agents
      </a>

      <a href="/templates" className="btn btn--ghost btn--sm">
        Templates
      </a>

      <Button variant="secondary" size="sm" onClick={onNewBuild}>
        New Build
      </Button>

      {/* Connection indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        paddingLeft: 12, borderLeft: '1px solid #E5E7EB',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? '#16A34A' : '#DC2626',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 12,
          color: connected ? '#15803D' : '#DC2626',
          fontWeight: 500,
          background: connected ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${connected ? '#BBF7D0' : '#FCA5A5'}`,
          borderRadius: 4,
          padding: '2px 8px',
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  )
}
