import React from 'react'

interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
}

export function Label({ className = '', children, ...props }: LabelProps) {
  return (
    <span
      className={`label ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  )
}
