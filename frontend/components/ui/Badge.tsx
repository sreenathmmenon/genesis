import React from 'react'

export type BadgeVariant =
  | 'default'
  | 'accent'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'meta'
  | 'build'
  | 'validate'
  | 'ops'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`badge badge--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  )
}
