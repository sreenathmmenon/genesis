import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, body, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-8 py-16 text-center gap-3 ${className}`}
    >
      {icon && (
        <div className="text-[32px] opacity-30">{icon}</div>
      )}
      <p className="text-md font-medium text-text-secondary">{title}</p>
      {body && (
        <p className="text-sm text-text-tertiary max-w-[280px]">{body}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
