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
      className={`input ${mono ? 'input--mono' : ''} ${className}`.trim()}
      {...props}
    />
  )
}

export function Textarea({ mono = false, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`input ${mono ? 'input--mono' : ''} ${className}`.trim()}
      {...props}
    />
  )
}
