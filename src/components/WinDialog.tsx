import { Bot, Sparkles, Star, Trophy } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { formatTime, plural } from '../lib/format'
import type { WinResult } from '../lib/scoring'
import { Dialog, DialogCloseButton } from './Dialog'

export interface WinAction {
  label: string
  icon?: ReactNode
  trailingIcon?: ReactNode
  primary?: boolean
  onClick: () => void
}

interface WinDialogProps {
  result: WinResult
  /** Title for a perfect result. */
  perfectTitle?: string
  /** Shown after a perfect result, e.g. why that number of moves is the minimum. */
  perfectNote: ReactNode
  actions: WinAction[]
  onClose: () => void
}

export function WinDialog({ result, perfectTitle = 'Perfect solve!', perfectNote, actions, onClose }: WinDialogProps) {
  const titleId = useId()
  const bySolver = result.assistedBy === 'solver'

  const title = bySolver ? 'Solved by the computer' : result.perfect ? perfectTitle : 'Puzzle solved!'

  let note: ReactNode
  if (bySolver) note = 'The auto-solver finished this one. Best scores only count when you solve it yourself.'
  else if (result.assistedBy === 'hints')
    note = `You used ${plural(result.hintsUsed, 'hint')}, so this solve doesn't count toward your best scores.`
  else if (result.perfect) note = perfectNote
  else note = result.improveNote

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="win-dialog">
      <DialogCloseButton onClick={onClose} />
      <div className="win-emblem" aria-hidden="true">
        {bySolver ? <Bot /> : <Trophy />}
      </div>
      <h2 id={titleId}>{title}</h2>
      {!bySolver && <Stars count={result.stars} />}

      <dl className="win-stats">
        <div>
          <dt>Moves</dt>
          <dd>{result.moves}</dd>
        </div>
        <div>
          <dt>{result.target.label}</dt>
          <dd>{result.target.value}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatTime(result.timeMs, true)}</dd>
        </div>
      </dl>

      {!bySolver && result.badges.length > 0 && (
        <ul className="win-badges">
          {result.badges.map((badge) => (
            <li key={badge}>
              <Sparkles aria-hidden="true" /> {badge}
            </li>
          ))}
        </ul>
      )}

      <p className="win-note">{note}</p>

      <div className="dialog-actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`button${action.primary ? ' button-primary' : ''}`}
            onClick={action.onClick}
            data-autofocus={action.primary || undefined}
          >
            {action.icon}
            {action.label}
            {action.trailingIcon}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <div className="stars" role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((star) => (
        <Star
          key={star}
          className={star <= count ? 'is-earned' : undefined}
          style={{ '--star': star } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
