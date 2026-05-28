'use client'

export default function CanvasPage() {
  return (
    <div className="layout-root">
      <div className="layout-toolbar">
        <span className="text-text-primary font-semibold tracking-tight text-md">Genesis</span>
        <span className="badge badge--accent">Canvas</span>
      </div>
      <div className="layout-body">
        <aside className="layout-left">
          <div className="p-4 flex flex-col gap-3">
            <span className="text-label">Agent Layers</span>
            <div className="flex flex-col gap-1">
              {(['meta', 'build', 'validate', 'ops'] as const).map((layer) => (
                <div
                  key={layer}
                  className={`badge badge--${layer} w-fit`}
                >
                  {layer}
                </div>
              ))}
            </div>
          </div>
        </aside>
        <main className="layout-center flex items-center justify-center">
          <div className="empty-state">
            <div className="empty-state-icon">⬡</div>
            <p className="empty-state-title">No workflow yet</p>
            <p className="empty-state-body">
              Send a message to your Telegram bot to start building a workflow.
            </p>
          </div>
        </main>
        <aside className="layout-right">
          <div className="p-4 border-b border-border-0">
            <span className="text-label">Monitor</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <p className="empty-state-title">No activity</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
