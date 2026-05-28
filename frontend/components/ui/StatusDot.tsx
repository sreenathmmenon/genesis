import React from 'react'

export type StatusDotState = 'active' | 'idle' | 'error' | 'building' | 'info'

interface StatusDotProps {
  state?: StatusDotState
  className?: string
}

const stateStyles: Record<StatusDotState, string> = {
  active:   'bg-accent shadow-[0_0_0_2px_var(--accent-dim)]',
  idle:     'bg-text-tertiary',
  error:    'bg-error',
  building: 'bg-warning animate-pulse-subtle',
  info:     'bg-info',
}

export function StatusDot({ state = 'idle', className = '' }: StatusDotProps) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${stateStyles[state]} ${className}`}
    />
  )
}
