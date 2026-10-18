import { Lightbulb, Play, Redo2, RotateCcw, Square, Undo2 } from 'lucide-react'
import { Stepper } from '../../components/Stepper'
import { MAX_DISKS, MIN_DISKS } from './hanoi'

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
      <Stepper
        label="Number of disks"
        value={diskCount}
        min={MIN_DISKS}
        max={MAX_DISKS}
        decreaseLabel="Fewer disks"
        increaseLabel="More disks"
        onChange={onDiskCountChange}
      >
        <strong>{diskCount}</strong> disks
      </Stepper>

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
