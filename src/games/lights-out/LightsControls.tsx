import { Lightbulb, Play, Redo2, RotateCcw, Shuffle, Square, Undo2 } from 'lucide-react'
import { Stepper } from '../../components/Stepper'
import { MAX_SIZE, MIN_SIZE } from './lightsOut'

interface LightsControlsProps {
  size: number
  canUndo: boolean
  canRedo: boolean
  canRestart: boolean
  canHint: boolean
  canSolve: boolean
  solverActive: boolean
  onSizeChange: (size: number) => void
  onNewPuzzle: () => void
  onUndo: () => void
  onRedo: () => void
  onRestart: () => void
  onHint: () => void
  onToggleSolver: () => void
}

export function LightsControls({
  size,
  canUndo,
  canRedo,
  canRestart,
  canHint,
  canSolve,
  solverActive,
  onSizeChange,
  onNewPuzzle,
  onUndo,
  onRedo,
  onRestart,
  onHint,
  onToggleSolver,
}: LightsControlsProps) {
  return (
    <section className="controls" aria-label="Game controls">
      <div className="control-group">
        <Stepper
          label="Grid size"
          value={size}
          min={MIN_SIZE}
          max={MAX_SIZE}
          decreaseLabel="Smaller grid"
          increaseLabel="Bigger grid"
          onChange={onSizeChange}
        >
          <strong>
            {size}×{size}
          </strong>
        </Stepper>
        <button type="button" className="button" onClick={onNewPuzzle} aria-label="New puzzle" title="New puzzle">
          <Shuffle aria-hidden="true" />
          <span className="button-label">New</span>
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
          title="Restart this puzzle"
        >
          <RotateCcw aria-hidden="true" />
          <span className="button-label collapsible">Restart</span>
        </button>
      </div>

      <div className="control-group">
        <button type="button" className="button" onClick={onHint} disabled={!canHint} title="Show a light to press (H)">
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
