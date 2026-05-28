import React from 'react'

interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
}

export function Label({ className = '', children, ...props }: LabelProps) {
  return (
    <span
      className={`text-xs font-medium tracking-wider uppercase text-text-tertiary ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
