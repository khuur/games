import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Confetti } from '../../components/Confetti'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GameControls } from '../../components/GameControls'
import { SolverControls } from '../../components/SolverControls'
import { StatsBar } from '../../components/StatsBar'
import { StatusBar, type StatusTone } from '../../components/StatusBar'
import { Stepper } from '../../components/Stepper'
import { WinDialog, type WinAction } from '../../components/WinDialog'
import { useAutoSolver, type SolverMode } from '../../hooks/useAutoSolver'
import { useCelebration } from '../../hooks/useCelebration'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import { FifteenBoard } from './FifteenBoard'
import {
  canSlide,
  countInPlace,
  GAP,
  homeOf,
  MAX_SIZE,
  MIN_SIZE,
  slide,
  slideDirection,
  solve,
  tileMoving,
  tilesToward,
  type Direction,
  type Tiles,
} from './fifteen'
import type { FifteenAction } from './gameState'
import { useFifteenGame } from './useFifteenGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

type PendingStart = { kind: 'restart' } | { kind: 'new'; size: number }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

const ARROWS: Record<string, Direction> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' }

export function FifteenGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newPuzzle, restart } = useFifteenGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { size, tiles, target, hint, history, future, status } = state
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const exact = size === 3
  const tileCount = size * size - 1
  const remaining = useMemo(() => (solverActive ? solve(tiles, size) : null), [solverActive, tiles, size])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  /** Whether any of these slides puts a tile where it belongs, for a brighter sound. */
  const landsHome = (board: Tiles, moved: number[]) => {
    let current = board
    let home = false
    for (const tile of moved) {
      if (!canSlide(current, tile, size)) break
      if (homeOf(tile, size) === current.indexOf(GAP)) home = true
      current = slide(current, tile)
    }
    return home
  }

  /** Plays a slide-like action and takes note when it wins the game. */
  const play = (action: FifteenAction) => {
    const result = act(action)
    if (!result) return
    setWinResult(result)
    announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'Solved'} in ${plural(result.moves, 'move')}!`)
  }

  const slideTiles = (moved: number[], bySolver = false) => {
    if (moved.length === 0) return
    sound.slide(landsHome(tiles, moved))
    if (!bySolver) {
      announce(`${moved.join(', ')} slid ${slideDirection(tiles, moved[0])}.`)
    }
    play({ type: 'slide', tiles: moved, bySolver })
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: tiles,
    step: () => {
      const tile = remaining?.[0]
      if (tile !== undefined) slideTiles([tile], true)
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const handleTap = (cell: number) => {
    if (!locked) slideTiles(tilesToward(tiles, cell, size))
  }

  const handleSwipe = (direction: Direction) => {
    if (locked) return
    const tile = tileMoving(tiles, direction, size)
    if (tile !== null) slideTiles([tile])
  }

  const undo = () => {
    if (locked || history.length === 0) return
    sound.slide(false)
    play({ type: 'undo' })
    announce('Move undone.')
  }

  const redo = () => {
    const next = future.at(-1)
    if (locked || next === undefined) return
    sound.slide(landsHome(tiles, [next]))
    play({ type: 'redo' })
    announce('Move redone.')
  }

  const showHint = () => {
    if (locked) return
    const tile = solve(tiles, size)[0]
    if (tile === undefined) return
    act({ type: 'hint', tile })
    announce(`Hint: slide ${tile} ${slideDirection(tiles, tile)}.`)
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    if (next.kind === 'restart') {
      restart()
      announce('Puzzle restarted.')
    } else {
      newPuzzle(next.size)
      announce(`New ${next.size} by ${next.size} puzzle.`)
    }
  }

  const requestStart = (next: PendingStart) => {
    if (status === 'playing' && history.length >= CONFIRM_AFTER_MOVES) setDialog({ kind: 'confirm', next })
    else begin(next)
  }

  const toggleSolver = () => {
    if (solverActive) {
      setSolverMode('off')
      announce('Auto-solve stopped.')
      return
    }
    if (won) return
    act({ type: 'solver-started' })
    setSolverMode('running')
    announce('Auto-solving.')
  }

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || dialog || paused) return
    const target = event.target
    if (target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"]')) return
    const key = event.key.toLowerCase()

    if (event.ctrlKey || event.metaKey) {
      if (event.altKey) return
      if (key === 'z' && !event.shiftKey) undo()
      else if (key === 'z' || key === 'y') redo()
      else return
      event.preventDefault()
      return
    }
    if (event.altKey) return

    if (ARROWS[key]) handleSwipe(ARROWS[key])
    else if (key === 'z') {
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') redo()
    else if (key === 'h' && !event.repeat) showHint()
    else return
    event.preventDefault()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleShortcut(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const message = ((): { tone: StatusTone; text: string } => {
    if (won) return { tone: 'success', text: `${state.solverUsed ? 'Auto-solved' : 'Solved'} in ${plural(history.length, 'move')}!` }
    if (solverActive) {
      return {
        tone: 'info',
        text:
          solverMode === 'paused'
            ? 'Auto-solve paused.'
            : `Auto-solving… ${plural(remaining?.length ?? 0, 'move')} to go.`,
      }
    }
    if (hint !== null) return { tone: 'hint', text: `Hint: slide ${hint} ${slideDirection(tiles, hint)}.` }
    if (status === 'ready') return { tone: 'info', text: `Put the tiles in order from 1 to ${tileCount}, with the gap last.` }
    return { tone: 'info', text: `${countInPlace(tiles)} of ${tileCount} tiles in place.` }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [
        {
          label: 'Try it yourself',
          icon: <RotateCcw aria-hidden="true" />,
          primary: true,
          onClick: () => begin({ kind: 'restart' }),
        },
      ]
    }
    const another: WinAction = {
      label: 'New puzzle',
      icon: <Shuffle aria-hidden="true" />,
      onClick: () => begin({ kind: 'new', size }),
    }
    if (size >= MAX_SIZE) return [{ ...another, primary: true }]
    return [
      another,
      {
        label: `Next: ${size + 1}×${size + 1}`,
        trailingIcon: <ChevronRight aria-hidden="true" />,
        primary: true,
        onClick: () => begin({ kind: 'new', size: size + 1 }),
      },
    ]
  }

  const record = records[size]

  return (
    <>
      <StatsBar
        progress={{ label: 'Moves', value: String(history.length), note: `${exact ? 'Minimum' : 'Par'} ${target}` }}
        elapsedMs={elapsedMs}
        status={status}
        timerPaused={solverActive || dialog !== null || paused}
        bestTimeMs={record?.timeMs}
        bestNote={record ? `${record.solved} solved` : ''}
      />

      <StatusBar
        tone={message.tone}
        actions={
          solverActive && (
            <SolverControls
              paused={solverMode === 'paused'}
              speedIndex={solver.speedIndex}
              onTogglePause={() => setSolverMode((mode) => (mode === 'running' ? 'paused' : 'running'))}
              onSpeedChange={solver.setSpeedIndex}
            />
          )
        }
      >
        {message.text}
      </StatusBar>

      <div className="board-card">
        <FifteenBoard
          size={size}
          tiles={tiles}
          gameId={state.gameId}
          hint={hint}
          locked={locked}
          won={won}
          onTap={handleTap}
          onSwipe={handleSwipe}
        />
      </div>

      <GameControls
        level={
          <Stepper
            label="Board size"
            value={size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            decreaseLabel="Smaller board"
            increaseLabel="Bigger board"
            onChange={(next) => requestStart({ kind: 'new', size: next })}
          >
            <strong>
              {size}×{size}
            </strong>
          </Stepper>
        }
        onNew={() => requestStart({ kind: 'new', size })}
        canUndo={!locked && history.length > 0}
        canRedo={!locked && future.length > 0}
        canRestart={history.length > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show a tile to slide"
        onUndo={undo}
        onRedo={redo}
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> slide · <kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>H</kbd>{' '}
        hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle={exact ? undefined : dialog.result.moves < target ? 'Under par!' : 'Right on par!'}
          perfectNote={
            exact
              ? "That's the shortest possible solution."
              : 'You matched or beat the classic method the computer uses.'
          }
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.next.kind === 'restart' ? 'Restart this puzzle?' : 'Start a new puzzle?'}
          message={`You'll lose your progress (${plural(history.length, 'move')} so far).`}
          confirmLabel={dialog.next.kind === 'restart' ? 'Restart' : 'New puzzle'}
          onConfirm={() => begin(dialog.next)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
