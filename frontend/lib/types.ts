export type MemoryType = 'none' | 'short_term' | 'long_term'
export type WorkflowStatus = 'draft' | 'building' | 'validating' | 'active' | 'paused' | 'failed' | 'awaiting_approval'
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type MessageType = 'state_update' | 'tool_call' | 'tool_result' | 'human_input' | 'agent_output'
export type BuildStatus = 'decomposing' | 'building' | 'critiquing' | 'validating' | 'awaiting_approval' | 'deployed' | 'failed'
export type AgentLayer = 'meta' | 'build' | 'validate' | 'ops' | 'generated'
export type AgentStatus = 'idle' | 'active' | 'error' | 'building'

export interface Agent {
  id: string
  name: string
  role: string
  system_prompt: string
  model_name: string
  tools: string[]
  memory_type: MemoryType
  schedule: string | null
  guardrails: Record<string, unknown>
  interaction_rules: Record<string, unknown>
  channel: string
  workflow_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  intent: string
  status: WorkflowStatus
  graph_json: Record<string, unknown> | null
  canvas_json: Record<string, unknown> | null
  template_name: string | null
  schedule_expr: string | null
  agents: Agent[]
  created_at: string
  updated_at: string
}

export interface SchedulerJob {
  job_id: string
  next_run: string | null
  trigger: string
}

export interface Message {
  id: string
  run_id: string
  sender_agent: string
  receiver_agent: string
  content: string
  message_type: MessageType
  timestamp: string
}

export interface Run {
  id: string
  workflow_id: string
  status: RunStatus
  started_at: string
  completed_at: string | null
  error: string | null
  token_count_total: number
  estimated_cost_usd: number
  messages: Message[]
  created_at: string
  updated_at: string
}

export interface GenesisBuild {
  id: string
  intent: string
  status: BuildStatus
  architect_output: Record<string, unknown> | null
  decomposer_output: Record<string, unknown> | null
  builder_output: Record<string, unknown> | null
  critic_feedback: Record<string, unknown> | null
  validator_report: Record<string, unknown> | null
  workflow_id: string | null
  iterations: number
  created_at: string
  updated_at: string
}

export interface Template {
  name: string
  description: string
  agent_count: number
  category: string
}

export interface MonitorLog {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'debug'
  agent: string
  message: string
}

export interface AgentMessage {
  id: string
  timestamp: string
  from_agent: string
  to_agent: string
  content: string
  type: MessageType
}

export interface BuildLog {
  id: string
  timestamp: string
  stage: string
  message: string
  level: 'info' | 'warning' | 'error'
}
