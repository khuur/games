import { Bot, ChevronRight, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import type { WinResult } from '../game/useHanoiGame'
import { formatTime, plural } from '../lib/format'
import { Dialog, DialogCloseButton } from './Dialog'

interface WinDialogProps {
  result: WinResult
  onClose: () => void
  onPlayAgain: () => void
  /** Absent when there is no bigger puzzle to move on to. */
  onNextLevel?: () => void
}

export function WinDialog({ result, onClose, onPlayAgain, onNextLevel }: WinDialogProps) {
  const titleId = useId()
  const bySolver = result.assistedBy === 'solver'
  const perfect = result.moves <= result.minimum

  const title = bySolver ? 'Solved by the computer' : perfect ? 'Perfect solve!' : 'Puzzle solved!'

  const badges: string[] = []
  if (result.firstSolve) badges.push(`First solve with ${result.diskCount} disks`)
  else {
    if (result.newBestTime) badges.push('New best time')
    if (result.newBestMoves) badges.push('New fewest moves')
  }

  let note: ReactNode
  if (bySolver) note = 'The auto-solver finished this one. Best scores only count when you solve it yourself.'
  else if (result.assistedBy === 'hints')
    note = `You used ${plural(result.hintsUsed, 'hint')}, so this solve doesn't count toward your best scores.`
  else if (perfect)
    note = (
      <>
        That&apos;s the shortest possible solution: 2<sup>{result.diskCount}</sup> − 1 = {result.minimum} moves.
      </>
    )
  else note = `The shortest solution takes ${result.minimum} moves. Can you find it?`

  const showNext = Boolean(onNextLevel) && !bySolver

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
          <dt>Minimum</dt>
          <dd>{result.minimum}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatTime(result.timeMs, true)}</dd>
        </div>
      </dl>

      {badges.length > 0 && (
        <ul className="win-badges">
          {badges.map((badge) => (
            <li key={badge}>
              <Sparkles aria-hidden="true" /> {badge}
            </li>
          ))}
        </ul>
      )}

      <p className="win-note">{note}</p>

      <div className="dialog-actions">
        <button
          type="button"
          className={`button${showNext ? '' : ' button-primary'}`}
          onClick={onPlayAgain}
          data-autofocus={showNext ? undefined : true}
        >
          <RotateCcw aria-hidden="true" /> {bySolver ? 'Try it yourself' : 'Play again'}
        </button>
        {showNext && (
          <button type="button" className="button button-primary" onClick={onNextLevel} data-autofocus>
            Next: {result.diskCount + 1} disks <ChevronRight aria-hidden="true" />
          </button>
        )}
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
