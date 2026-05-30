'use client'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { color: string; dot: string; pulse: boolean }> = {
  draft:             { color: 'var(--text-tertiary)',  dot: 'var(--text-tertiary)', pulse: false },
  building:          { color: 'var(--warning)',        dot: 'var(--warning)',       pulse: true  },
  decomposing:       { color: 'var(--warning)',        dot: 'var(--warning)',       pulse: true  },
  validating:        { color: 'var(--info)',           dot: 'var(--info)',          pulse: true  },
  reviewing:         { color: 'var(--info)',           dot: 'var(--info)',          pulse: true  },
  active:            { color: 'var(--accent-text)',    dot: 'var(--accent-text)',   pulse: false },
  awaiting_approval: { color: 'var(--layer-ops)',      dot: 'var(--layer-ops)',     pulse: true  },
  paused:            { color: 'var(--warning)',        dot: 'var(--warning)',       pulse: false },
  failed:            { color: 'var(--error)',          dot: 'var(--error)',         pulse: false },
  completed:         { color: 'var(--success)',        dot: 'var(--success)',       pulse: false },
  running:           { color: 'var(--accent-text)',    dot: 'var(--accent-text)',   pulse: true  },
  cancelled:         { color: 'var(--text-tertiary)',  dot: 'var(--text-tertiary)', pulse: false },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { color: 'var(--text-tertiary)', dot: 'var(--text-tertiary)', pulse: false }
  const label = status.replace(/_/g, ' ')

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: config.color,
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: config.dot,
          flexShrink: 0,
          animation: config.pulse ? 'pulse 1.5s infinite' : 'none',
        }}
      />
      {label}
    </span>
  )
}
