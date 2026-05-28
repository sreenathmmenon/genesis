import { Badge, StatusDot } from '@/components/ui'
import type { BadgeVariant } from '@/components/ui'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { variant: BadgeVariant; pulse: boolean }> = {
  draft:              { variant: 'default',  pulse: false },
  building:           { variant: 'warning',  pulse: true  },
  decomposing:        { variant: 'warning',  pulse: true  },
  validating:         { variant: 'info',     pulse: true  },
  reviewing:          { variant: 'info',     pulse: true  },
  active:             { variant: 'accent',   pulse: false },
  awaiting_approval:  { variant: 'ops',      pulse: true  },
  paused:             { variant: 'warning',  pulse: false },
  failed:             { variant: 'error',    pulse: false },
  completed:          { variant: 'success',  pulse: false },
  cancelled:          { variant: 'default',  pulse: false },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { variant: 'default' as BadgeVariant, pulse: false }

  return (
    <Badge variant={config.variant} className={`inline-flex items-center gap-1.5 ${className}`}>
      {config.pulse && <StatusDot state="building" />}
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}
