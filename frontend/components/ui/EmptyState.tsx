import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function EmptyState({ icon, title, body, action, className = '', style }: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${className}`.trim()}
      style={style}
    >
      {icon && (
        <div className="empty-state-icon">{icon}</div>
      )}
      <p className="empty-state-title">{title}</p>
      {body && (
        <p className="empty-state-body">{body}</p>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}
