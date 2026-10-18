import type { GameStatus } from '../hooks/useGameSession'
import { formatTime } from '../lib/format'

interface StatsBarProps {
  /** The first tile, usually moves against the minimum. */
  progress: { label: string; value: string; note: string }
  elapsedMs: number
  status: GameStatus
  timerPaused: boolean
  bestTimeMs?: number
  /** Second line of the "Best" tile, e.g. "Fewest moves 7". */
  bestNote: string
}

export function StatsBar({ progress, elapsedMs, status, timerPaused, bestTimeMs, bestNote }: StatsBarProps) {
  let timeNote = ''
  if (status === 'ready') timeNote = 'Not started'
  else if (status === 'stuck') timeNote = 'Stopped'
  else if (status === 'playing' && timerPaused) timeNote = 'Paused'

  return (
    <section className="stats" aria-label="Statistics">
      <Stat label={progress.label} value={progress.value} note={progress.note} />
      <Stat label="Time" value={formatTime(elapsedMs)} note={timeNote} />
      <Stat
        label="Best"
        value={bestTimeMs === undefined ? '–' : formatTime(bestTimeMs, true)}
        note={bestTimeMs === undefined ? 'None yet' : bestNote}
      />
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note || '\u00a0'}</span>
    </div>
  )
}
