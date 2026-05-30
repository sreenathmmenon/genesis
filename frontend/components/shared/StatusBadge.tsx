'use client'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { color: string; dot: string; pulse: boolean }> = {
  draft:             { color: '#6B7280',  dot: '#9CA3AF',  pulse: false },
  building:          { color: '#D97706',  dot: '#D97706',  pulse: true  },
  decomposing:       { color: '#D97706',  dot: '#D97706',  pulse: true  },
  validating:        { color: '#2563EB',  dot: '#2563EB',  pulse: true  },
  reviewing:         { color: '#2563EB',  dot: '#2563EB',  pulse: true  },
  active:            { color: '#16A34A',  dot: '#16A34A',  pulse: false },
  awaiting_approval: { color: '#7C3AED',  dot: '#7C3AED',  pulse: true  },
  paused:            { color: '#6B7280',  dot: '#9CA3AF',  pulse: false },
  failed:            { color: '#DC2626',  dot: '#DC2626',  pulse: false },
  completed:         { color: '#16A34A',  dot: '#16A34A',  pulse: false },
  running:           { color: '#D97706',  dot: '#D97706',  pulse: true  },
  cancelled:         { color: '#6B7280',  dot: '#9CA3AF',  pulse: false },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { color: '#6B7280', dot: '#9CA3AF', pulse: false }
  const label = status.replace(/_/g, ' ')

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        color: config.color,
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: config.dot,
          flexShrink: 0,
          animation: config.pulse ? 'pulse-subtle 1.5s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
        }}
      />
      {label}
    </span>
  )
}
