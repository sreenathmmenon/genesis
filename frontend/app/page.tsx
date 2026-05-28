import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="layout-root">
      {/* Toolbar */}
      <div className="layout-toolbar">
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Genesis
        </span>
        <span className="badge badge--accent">v0.1</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link href="/templates" className="btn btn--ghost btn--sm">Templates</Link>
          <Link href="/history" className="btn btn--ghost btn--sm">History</Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>

          {/* Logo mark */}
          <div style={{ fontSize: 40, marginBottom: 24, opacity: 0.15 }}>⬡</div>

          <h1 style={{
            fontSize: 32, fontWeight: 600, color: 'var(--text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 12,
          }}>
            AI Agent Orchestration
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.7,
            marginBottom: 32, fontWeight: 400,
          }}>
            Describe an outcome in one sentence.<br />
            Genesis builds, validates, and deploys<br />
            the agent system that achieves it.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/canvas" className="btn btn--primary btn--lg">
              Open Canvas →
            </Link>
            <Link href="/templates" className="btn btn--secondary btn--lg">
              Templates
            </Link>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1, marginTop: 48,
            background: 'var(--border-0)', border: '1px solid var(--border-0)', borderRadius: 5,
            overflow: 'hidden',
          }}>
            {[
              ['4 min', 'Intent to system'],
              ['0', 'Lines of config'],
              ['3', 'Human actions'],
            ].map(([num, label]) => (
              <div key={label} style={{
                background: 'var(--surface-1)', padding: '16px 12px', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 22, fontWeight: 600, color: 'var(--accent)', lineHeight: 1,
                }}>
                  {num}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
