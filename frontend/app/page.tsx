import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="layout-root">
      <div className="layout-toolbar">
        <span className="text-text-primary font-semibold tracking-tight text-md">Genesis</span>
        <span className="badge badge--accent">v0.1</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center flex flex-col items-center gap-6 max-w-md">
          <div className="flex flex-col gap-2">
            <h1 className="text-text-primary">AI Agent Orchestration</h1>
            <p className="text-text-secondary text-base">
              Describe an outcome. Genesis builds, validates, and deploys the agent system.
            </p>
          </div>
          <Link href="/canvas" className="btn btn--primary">
            Open Canvas
          </Link>
        </div>
      </div>
    </div>
  )
}
