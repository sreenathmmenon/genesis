import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'accent'
  children: React.ReactNode
}

const variantClass = {
  default:  'card',
  elevated: 'card card--elevated',
  accent:   'card card--accent',
} as const

export function Card({ variant = 'default', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`${variantClass[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardHeader({ className = '', children, ...props }: CardSectionProps) {
  return (
    <div
      className={`flex items-center justify-between pb-3 mb-3 border-b border-border-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardBody({ className = '', children, ...props }: CardSectionProps) {
  return (
    <div className={`${className}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className = '', children, ...props }: CardSectionProps) {
  return (
    <div
      className={`flex items-center gap-2 pt-3 mt-3 border-t border-border-0 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
