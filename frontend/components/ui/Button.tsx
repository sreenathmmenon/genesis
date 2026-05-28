import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:     'bg-accent text-text-inverse border-accent hover:bg-[#c4ff3d]',
  secondary:   'bg-surface-2 text-text-secondary border-border-2 hover:bg-surface-3 hover:text-text-primary',
  ghost:       'bg-transparent text-text-tertiary border-transparent hover:bg-surface-2 hover:text-text-primary',
  destructive: 'bg-[#200a0a] text-error border-[#4a1515] hover:bg-[#4a1515]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-md',
  lg: 'px-6 py-3 text-lg',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-md font-medium
        border cursor-pointer whitespace-nowrap select-none
        transition-colors duration-fast ease-default
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
