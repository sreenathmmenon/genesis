'use client'

import type { Toast, ToastType } from '@/lib/useToast'

const TYPE_CLASSES: Record<ToastType, string> = {
  success: 'bg-accent-dim border-accent-border text-accent-text',
  error:   'bg-[var(--error-dim)] border-[var(--error-border)] text-error',
  info:    'bg-[var(--info-dim)] border-[var(--info-border)] text-info',
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-md border',
        'text-sm font-medium leading-snug',
        'animate-[slide-in-right_200ms_var(--ease-default)]',
        TYPE_CLASSES[toast.type],
      ].join(' ')}
      role="alert"
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-current opacity-60 hover:opacity-100 transition-opacity duration-fast flex-shrink-0 leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
