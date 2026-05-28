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

const variantStyles: Record<BadgeVariant, string> = {
  default:  'text-text-tertiary border-border-1 bg-surface-2',
  accent:   'text-accent-text border-accent-border bg-accent-dim',
  error:    'text-error border-[#4a1515] bg-[#200a0a]',
  warning:  'text-warning border-[#4a3000] bg-[#201400]',
  success:  'text-success border-[#155030] bg-[#062010]',
  info:     'text-info border-[#153a5a] bg-[#081525]',
  meta:     'text-layer-meta border-[#2a3d00] bg-[#0d1500]',
  build:    'text-layer-build border-[#4a2500] bg-[#160a00]',
  validate: 'text-layer-validate border-[#0a2a3d] bg-[#030e16]',
  ops:      'text-layer-ops border-[#2a1a4a] bg-[#0a0515]',
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium tracking-wide px-2 py-0.5 rounded-sm border whitespace-nowrap ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
