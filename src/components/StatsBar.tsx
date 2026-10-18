import type { BestRecord } from '../game/persistence'
import { formatTime } from '../lib/format'

interface StatsBarProps {
  moves: number
  minimum: number
  elapsedMs: number
  timeNote: string
  record?: BestRecord
}

export function StatsBar({ moves, minimum, elapsedMs, timeNote, record }: StatsBarProps) {
  return (
    <section className="stats" aria-label="Statistics">
      <Stat label="Moves" value={String(moves)} note={`Minimum ${minimum}`} />
      <Stat label="Time" value={formatTime(elapsedMs)} note={timeNote} />
      <Stat
        label="Best"
        value={record ? formatTime(record.timeMs, true) : '–'}
        note={record ? `Fewest moves ${record.moves}` : 'Not solved yet'}
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
