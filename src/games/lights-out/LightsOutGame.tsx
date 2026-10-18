import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Confetti } from '../../components/Confetti'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GameControls } from '../../components/GameControls'
import { SolverControls } from '../../components/SolverControls'
import { StatsBar } from '../../components/StatsBar'
import { Stepper } from '../../components/Stepper'
import { StatusBar, type StatusTone } from '../../components/StatusBar'
import { WinDialog, type WinAction } from '../../components/WinDialog'
import { useAutoSolver, type SolverMode } from '../../hooks/useAutoSolver'
import { useCelebration } from '../../hooks/useCelebration'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import type { LightsOutAction } from './gameState'
import { LightsBoard } from './LightsBoard'
import { countLit, MAX_SIZE, MIN_SIZE, press, solve } from './lightsOut'
import { useLightsOutGame } from './useLightsOutGame'

/** Starting over after at least this many presses asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

type PendingStart = { kind: 'restart' } | { kind: 'new'; size: number }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

const describeCell = (cell: number, size: number) =>
  `row ${Math.floor(cell / size) + 1}, column ${(cell % size) + 1}`

export function LightsOutGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newPuzzle, restart } = useLightsOutGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { size, lights, minimum, hint, history, future, status } = state
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const lit = countLit(lights)

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  /** Plays a press-like action, with its sound, and takes note when it wins the game. */
  const play = (action: LightsOutAction, cell: number) => {
    const next = press(lights, cell, size)
    sound.light(1 - countLit(next) / next.length)
    const result = act(action)
    if (result) {
      setWinResult(result)
      announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'All lights out'} in ${plural(result.moves, 'move')}!`)
    } else if (action.type === 'press' && !action.bySolver) {
      announce(`Pressed ${describeCell(cell, size)}. ${plural(countLit(next), 'light')} on.`)
    }
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: lights,
    step: () => {
      const cell = solve(lights, size)?.[0]
      if (cell !== undefined) play({ type: 'press', cell, bySolver: true }, cell)
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const handlePress = (cell: number) => {
    if (!locked) play({ type: 'press', cell }, cell)
  }

  const undo = () => {
    const last = history.at(-1)
    if (locked || last === undefined) return
    play({ type: 'undo' }, last)
    announce('Press undone.')
  }

  const redo = () => {
    const next = future.at(-1)
    if (locked || next === undefined) return
    play({ type: 'redo' }, next)
    announce('Press redone.')
  }

  const showHint = () => {
    if (locked) return
    const cell = solve(lights, size)?.[0]
    if (cell === undefined) return
    act({ type: 'hint' })
    announce(`Hint: press ${describeCell(cell, size)}.`)
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.lights-board'))) {
      // Arrow keys anywhere else jump into the grid, ready to move around it.
      document.querySelector<HTMLElement>('.lights-board [tabindex="0"]')?.focus()
    } else if (key === 'z') {
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      redo()
    } else if (key === 'h' && !event.repeat) {
      showHint()
    } else {
      return
    }
    event.preventDefault()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleShortcut(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const message = ((): { tone: StatusTone; text: string } => {
    if (won) {
      const verb = state.solverUsed ? 'Auto-solved' : 'All lights out'
      return { tone: 'success', text: `${verb} in ${plural(history.length, 'move')}!` }
    }
    if (solverActive) {
      const left = solve(lights, size)?.length ?? 0
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(left, 'press', 'presses')} to go.`,
      }
    }
    if (hint !== null) return { tone: 'hint', text: `Hint: press the light in ${describeCell(hint, size)}.` }
    if (status === 'ready') return { tone: 'info', text: 'Switch every light off. A press flips a light and its neighbours.' }
    return { tone: 'info', text: `${plural(lit, 'light')} still on.` }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [
        { label: 'Try it yourself', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin({ kind: 'restart' }) },
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
        progress={{ label: 'Moves', value: String(history.length), note: `Minimum ${minimum}` }}
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
        <LightsBoard
          size={size}
          lights={lights}
          gameId={state.gameId}
          hint={hint}
          lastCell={state.lastCell}
          locked={locked}
          won={won}
          onPress={handlePress}
        />
      </div>

      <GameControls
        level={
          <Stepper
            label="Grid size"
            value={size}
            min={MIN_SIZE}
            max={MAX_SIZE}
            decreaseLabel="Smaller grid"
            increaseLabel="Bigger grid"
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
        hintTitle="Show a light to press"
        onUndo={undo}
        onRedo={redo}
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> press · <kbd>Z</kbd> undo ·{' '}
        <kbd>Y</kbd> redo · <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectNote="That's the fewest presses this puzzle allows."
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
