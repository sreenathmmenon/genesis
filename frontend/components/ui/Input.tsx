import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean
}

export function Input({ mono = false, className = '', ...props }: InputProps) {
  return (
    <input
      className={`
        w-full bg-surface-1 border border-border-2 rounded-md
        px-3 py-2 text-text-primary
        placeholder:text-[#4a4a4a]
        transition-colors duration-fast ease-default
        focus:border-border-3 focus:outline-none
        ${mono ? 'font-mono text-sm' : 'font-sans text-base'}
        ${className}
      `}
      {...props}
    />
  )
}

export function Textarea({ mono = false, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`
        w-full bg-surface-1 border border-border-2 rounded-md
        px-3 py-2 text-text-primary
        placeholder:text-[#4a4a4a]
        transition-colors duration-fast ease-default
        focus:border-border-3 focus:outline-none
        resize-y min-h-[80px] leading-relaxed
        ${mono ? 'font-mono text-sm' : 'font-sans text-base'}
        ${className}
      `}
      {...props}
    />
  )
}
