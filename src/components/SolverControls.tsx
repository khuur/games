import { Gauge, Pause, Play } from 'lucide-react'
import { SOLVER_SPEEDS } from '../hooks/useAutoSolver'

interface SolverControlsProps {
  paused: boolean
  speedIndex: number
  onTogglePause: () => void
  onSpeedChange: (speedIndex: number) => void
}

/** Pause and speed controls shown while an auto-solver runs. */
export function SolverControls({ paused, speedIndex, onTogglePause, onSpeedChange }: SolverControlsProps) {
  const speed = SOLVER_SPEEDS[speedIndex]
  return (
    <>
      <button
        type="button"
        className="icon-button small"
        onClick={onTogglePause}
        aria-label={paused ? 'Resume auto-solve' : 'Pause auto-solve'}
        title={paused ? 'Resume' : 'Pause'}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </button>
      <label className="speed" title="Auto-solve speed">
        <Gauge aria-hidden="true" />
        <span className="sr-only">Auto-solve speed</span>
        <input
          type="range"
          min={0}
          max={SOLVER_SPEEDS.length - 1}
          step={1}
          value={speedIndex}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          aria-valuetext={speed.label}
        />
        <output aria-hidden="true">{speed.label}</output>
      </label>
    </>
  )
}
