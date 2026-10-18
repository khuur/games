import { Lightbulb, Minus, Play, Plus, Redo2, RotateCcw, Square, Undo2 } from 'lucide-react'
import { MAX_DISKS, MIN_DISKS } from '../game/hanoi'

interface ControlsProps {
  diskCount: number
  canUndo: boolean
  canRedo: boolean
  canRestart: boolean
  canHint: boolean
  canSolve: boolean
  solverActive: boolean
  onDiskCountChange: (diskCount: number) => void
  onUndo: () => void
  onRedo: () => void
  onRestart: () => void
  onHint: () => void
  onToggleSolver: () => void
}

export function Controls({
  diskCount,
  canUndo,
  canRedo,
  canRestart,
  canHint,
  canSolve,
  solverActive,
  onDiskCountChange,
  onUndo,
  onRedo,
  onRestart,
  onHint,
  onToggleSolver,
}: ControlsProps) {
  return (
    <section className="controls" aria-label="Game controls">
      <div className="stepper" role="group" aria-label="Number of disks">
        <button
          type="button"
          className="button stepper-button"
          onClick={() => onDiskCountChange(diskCount - 1)}
          disabled={diskCount <= MIN_DISKS}
          aria-label="Fewer disks"
          title="Fewer disks"
        >
          <Minus aria-hidden="true" />
        </button>
        <span className="stepper-value">
          <strong>{diskCount}</strong> disks
        </span>
        <button
          type="button"
          className="button stepper-button"
          onClick={() => onDiskCountChange(diskCount + 1)}
          disabled={diskCount >= MAX_DISKS}
          aria-label="More disks"
          title="More disks"
        >
          <Plus aria-hidden="true" />
        </button>
      </div>

      <div className="control-group">
        <button type="button" className="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Z)">
          <Undo2 aria-hidden="true" />
          <span className="button-label collapsible">Undo</span>
        </button>
        <button type="button" className="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Y)">
          <Redo2 aria-hidden="true" />
          <span className="button-label collapsible">Redo</span>
        </button>
        <button
          type="button"
          className="button"
          onClick={onRestart}
          disabled={!canRestart}
          aria-label="Restart"
          title="Restart"
        >
          <RotateCcw aria-hidden="true" />
          <span className="button-label collapsible">Restart</span>
        </button>
      </div>

      <div className="control-group">
        <button type="button" className="button" onClick={onHint} disabled={!canHint} title="Show the best next move (H)">
          <Lightbulb aria-hidden="true" />
          <span className="button-label">Hint</span>
        </button>
        <button
          type="button"
          className={`button${solverActive ? ' is-active' : ''}`}
          onClick={onToggleSolver}
          disabled={!canSolve}
          title={solverActive ? 'Stop the auto-solver' : 'Let the computer finish the puzzle'}
        >
          {solverActive ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span className="button-label">{solverActive ? 'Stop' : 'Solve'}</span>
        </button>
      </div>
    </section>
  )
}
