import React from 'react'

interface DividerProps {
  variant?: 'subtle' | 'default' | 'bold'
  className?: string
}

const variantClass = {
  subtle:  'divider divider--subtle',
  default: 'divider',
  bold:    'divider divider--bold',
} as const

export function Divider({ variant = 'default', className = '' }: DividerProps) {
  return (
    <div
      className={`${variantClass[variant]} ${className}`.trim()}
    />
  )
}
