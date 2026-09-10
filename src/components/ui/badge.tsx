import type { ReactNode } from 'react'

type Tone = 'neutral' | 'primary' | 'gold' | 'danger' | 'warning'

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  primary: 'bg-primary-soft text-primary-dark',
  gold: 'bg-gold-soft text-gold',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
}

export default function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full
        text-[11px] font-semibold tracking-wide
        ${toneClasses[tone]} ${className}
      `}
    >
      {children}
    </span>
  )
}
