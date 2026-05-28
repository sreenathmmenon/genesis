import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'accent'
  children: React.ReactNode
}

export function Card({ variant = 'default', className = '', children, ...props }: CardProps) {
  const variantClass = {
    default:  'bg-surface-1 border border-border-1 hover:bg-surface-2',
    elevated: 'bg-surface-2 border border-border-2',
    accent:   'bg-accent-dim border border-accent-border',
  }[variant]

  return (
    <div
      className={`rounded-md p-4 transition-colors duration-fast ease-default ${variantClass} ${className}`}
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
    <div className={`text-text-secondary text-base ${className}`} {...props}>
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
