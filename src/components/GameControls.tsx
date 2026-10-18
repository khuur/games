import { Lightbulb, Play, Redo2, RotateCcw, Shuffle, Square, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface GameControlsProps {
  /** Picks the level: a stepper or a choice group. */
  level: ReactNode
  /** Deals a new random puzzle; leave out for games with fixed puzzles. */
  onNew?: () => void
  canUndo: boolean
  canRedo: boolean
  canRestart: boolean
  canHint: boolean
  canSolve: boolean
  solverActive: boolean
  hintTitle: string
  onUndo: () => void
  onRedo: () => void
  onRestart: () => void
  onHint: () => void
  onToggleSolver: () => void
}

/** The buttons under every board: level, new puzzle, undo/redo/restart, hint and auto-solve. */
export function GameControls({
  level,
  onNew,
  canUndo,
  canRedo,
  canRestart,
  canHint,
  canSolve,
  solverActive,
  hintTitle,
  onUndo,
  onRedo,
  onRestart,
  onHint,
  onToggleSolver,
}: GameControlsProps) {
  return (
    <section className="controls" aria-label="Game controls">
      <div className="control-group">
        {level}
        {onNew && (
          <button type="button" className="button" onClick={onNew} aria-label="New puzzle" title="New puzzle">
            <Shuffle aria-hidden="true" />
            <span className="button-label">New</span>
          </button>
        )}
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
        <button type="button" className="button" onClick={onHint} disabled={!canHint} title={`${hintTitle} (H)`}>
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
