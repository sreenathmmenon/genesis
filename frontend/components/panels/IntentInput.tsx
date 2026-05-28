'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Label } from '@/components/ui'
import { api } from '@/lib/api'
import { useGenesisStore } from '@/lib/store'

const PLACEHOLDERS = [
  'Monitor our GitHub repo and alert me when a PR hasn\'t been reviewed in 24 hours...',
  'Every Monday at 8am, brief me on my competitors\' latest product changes...',
  'Watch our production logs and alert me when error rate exceeds 5%...',
  'When a customer sends a support message, route it to the right team automatically...',
]

interface IntentInputProps {
  onClose: () => void
}

export function IntentInput({ onClose }: IntentInputProps) {
  const [intent, setIntent] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const setBuilding = useGenesisStore((s) => s.setBuilding)
  const setCurrentBuildId = useGenesisStore((s) => s.setCurrentBuildId)
  const setBuildStatus = useGenesisStore((s) => s.setBuildStatus)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cycle placeholder
  useEffect(() => {
    const id = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3000,
    )
    return () => clearInterval(id)
  }, [])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const handleSubmit = useCallback(async () => {
    if (intent.trim().length < 20) {
      setError('Please describe your intent in at least 20 characters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const build = await api.startBuild(intent.trim())
      setCurrentBuildId(build.id)
      setBuilding(true)
      setBuildStatus('decomposing')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start build')
    } finally {
      setLoading(false)
    }
  }, [intent, onClose, setBuilding, setCurrentBuildId, setBuildStatus])

  const remaining = 500 - intent.length

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-surface-0/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal card */}
      <div className="w-full max-w-lg bg-surface-1 border border-border-2 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-xl font-semibold text-text-primary tracking-tight">
            What do you want to build?
          </h2>
          <p className="text-sm text-text-tertiary mt-1">
            Be specific about triggers, conditions, and what you want to happen.
          </p>
        </div>

        {/* Textarea */}
        <div className="px-6">
          <textarea
            ref={textareaRef}
            value={intent}
            onChange={(e) => { setIntent(e.target.value.slice(0, 500)); setError('') }}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={4}
            className="w-full bg-surface-2 border border-border-2 rounded-md px-4 py-3 text-base text-text-primary placeholder:text-text-tertiary focus:border-border-3 focus:outline-none transition-colors duration-fast resize-none leading-relaxed"
          />
          {/* Character counter */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-text-tertiary">
              ⌘ + Enter to submit · Escape to cancel
            </span>
            <span
              className={[
                'text-xs font-mono',
                remaining < 50 ? 'text-warning' : 'text-text-tertiary',
              ].join(' ')}
            >
              {intent.length}/500
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 px-3 py-2 bg-[var(--error-dim)] border border-[var(--error-border)] rounded-md">
            <p className="text-xs text-error">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-0 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={loading || intent.trim().length < 20}
          >
            {loading ? 'Sending to Telegram…' : 'Build with Genesis ✨'}
          </Button>
        </div>

      </div>
    </div>
  )
}
