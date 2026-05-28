import React from 'react'

interface DividerProps {
  variant?: 'subtle' | 'default' | 'bold'
  className?: string
}

const variantStyles = {
  subtle:  'bg-border-0',
  default: 'bg-border-0',
  bold:    'bg-border-2',
}

export function Divider({ variant = 'default', className = '' }: DividerProps) {
  return (
    <div
      className={`h-px my-4 ${variantStyles[variant]} ${className}`}
    />
  )
}
