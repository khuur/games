import { CircleAlert, Lightbulb, PartyPopper } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusTone = 'info' | 'error' | 'success' | 'hint'

const ICONS = { info: null, error: CircleAlert, success: PartyPopper, hint: Lightbulb }

export function StatusBar({ tone, children, actions }: { tone: StatusTone; children: ReactNode; actions?: ReactNode }) {
  const Icon = ICONS[tone]
  return (
    <div className={`status status-${tone}`}>
      <p className="status-text">
        {Icon && <Icon className="status-icon" aria-hidden="true" />}
        <span>{children}</span>
      </p>
      {actions && <div className="status-actions">{actions}</div>}
    </div>
  )
}
