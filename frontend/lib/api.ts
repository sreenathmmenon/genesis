import type { Agent } from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'

const json = (res: Response) => {
  if (!res.ok) throw new Error(`API ${res.status}: ${res.url}`)
  return res.json()
}

export const api = {
  // ── Genesis builds ─────────────────────────────────────────────────────────
  startBuild: (intent: string) =>
    fetch(`${API_BASE}/api/v1/genesis/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    }).then(json),

  getBuild: (id: string) =>
    fetch(`${API_BASE}/api/v1/genesis/builds/${id}`).then(json),

  listBuilds: () =>
    fetch(`${API_BASE}/api/v1/genesis/builds`).then(json),

  deployBuild: (id: string) =>
    fetch(`${API_BASE}/api/v1/genesis/deploy/${id}`, { method: 'POST' }).then(json),

  // ── Agents ─────────────────────────────────────────────────────────────────
  getAgents: (workflowId?: string) =>
    fetch(
      `${API_BASE}/api/v1/agents${workflowId ? `?workflow_id=${workflowId}` : ''}`
    ).then(json),

  updateAgent: (id: string, data: Partial<Agent>) =>
    fetch(`${API_BASE}/api/v1/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  // ── Workflows ──────────────────────────────────────────────────────────────
  getWorkflows: () =>
    fetch(`${API_BASE}/api/v1/workflows`).then(json),

  getWorkflow: (id: string) =>
    fetch(`${API_BASE}/api/v1/workflows/${id}`).then(json),

  updateWorkflow: (id: string, data: Record<string, unknown>) =>
    fetch(`${API_BASE}/api/v1/workflows/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  // ── Runs + Messages ────────────────────────────────────────────────────────
  getRuns: (workflowId?: string) =>
    fetch(
      `${API_BASE}/api/v1/runs${workflowId ? `?workflow_id=${workflowId}` : ''}`
    ).then(json),

  getRun: (runId: string) =>
    fetch(`${API_BASE}/api/v1/runs/${runId}`).then(json),

  getRunOutput: (runId: string) =>
    fetch(`${API_BASE}/api/v1/runs/${runId}/output`).then(json),

  getMessages: (runId: string) =>
    fetch(`${API_BASE}/api/v1/runs/${runId}/messages`).then(json),

  rerunRun: (runId: string) =>
    fetch(`${API_BASE}/api/v1/runs/${runId}/rerun`, { method: 'POST' }).then(json),

  downloadRunUrl: (runId: string, fmt: 'text' | 'json' | 'csv') =>
    `${API_BASE}/api/v1/runs/${runId}/download?fmt=${fmt}`,

  // ── Templates ──────────────────────────────────────────────────────────────
  getTemplates: () =>
    fetch(`${API_BASE}/api/v1/templates`).then(json),

  deployTemplate: (name: string) =>
    fetch(`${API_BASE}/api/v1/templates/${name}/deploy`, { method: 'POST' }).then(json),

  // ── Workflow execution ──────────────────────────────────────────────────────
  runWorkflow: (id: string) =>
    fetch(`${API_BASE}/api/v1/workflows/${id}/run`, { method: 'POST' }).then(json),

  scheduleWorkflow: (id: string, cron_expr: string) =>
    fetch(`${API_BASE}/api/v1/workflows/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron_expr }),
    }).then(json),

  removeSchedule: (id: string) =>
    fetch(`${API_BASE}/api/v1/workflows/${id}/schedule`, { method: 'DELETE' }).then(json),

  getSchedulerJobs: () =>
    fetch(`${API_BASE}/api/v1/scheduler/jobs`).then(json),

  // ── Workflow-scoped runs ───────────────────────────────────────────────────
  getWorkflowRuns: (workflowId: string) =>
    fetch(`${API_BASE}/api/v1/runs?workflow_id=${workflowId}`).then(json),

  // ── Tool names ─────────────────────────────────────────────────────────────
  getToolNames: () =>
    fetch(`${API_BASE}/api/v1/tools/names`).then(json),

  // ── Audit log ──────────────────────────────────────────────────────────────
  getAuditLogs: (params?: { event_type?: string; entity_type?: string; entity_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.event_type) qs.set('event_type', params.event_type)
    if (params?.entity_type) qs.set('entity_type', params.entity_type)
    if (params?.entity_id) qs.set('entity_id', params.entity_id)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return fetch(`${API_BASE}/api/v1/audit${q ? `?${q}` : ''}`).then(json)
  },

  getAuditEventTypes: () =>
    fetch(`${API_BASE}/api/v1/audit/event-types`).then(json),

  // ── Health ─────────────────────────────────────────────────────────────────
  health: () =>
    fetch(`${API_BASE}/api/v1/health`).then(json),
}
