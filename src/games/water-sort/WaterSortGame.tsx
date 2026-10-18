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
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import type { WaterSortAction } from './gameState'
import { useWaterSortGame } from './useWaterSortGame'
import { WaterBoard } from './WaterBoard'
import {
  CAPACITY,
  countComplete,
  isComplete,
  MAX_COLORS,
  MIN_COLORS,
  pour,
  pourAmount,
  solve,
  type Pour,
} from './waterSort'

/** Starting over after at least this many pours asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10
/** How long one pour animation takes when nothing hurries it. */
const POUR_DURATION = 760

type PendingStart = { kind: 'restart' } | { kind: 'new'; colors: number }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

export function WaterSortGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newPuzzle, restart } = useWaterSortGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { colors, tubes, minimum, selected, hint, history, future, status } = state
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [rejected, setRejected] = useState<{ tube: number; id: number } | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const remaining = useMemo(() => (solverActive ? solve(tubes) : null), [solverActive, tubes])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays a pour-like action and takes note when it wins the game. */
  const play = (action: WaterSortAction) => {
    const result = act(action)
    if (!result) return
    setWinResult(result)
    announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'All sorted'} in ${plural(result.moves, 'pour')}!`)
  }

  const pourWithSound = (move: Pour, bySolver = false) => {
    const after = pour(tubes, move)
    sound.pour(after[move.to].length / CAPACITY, isComplete(after[move.to]))
    setNotice(null)
    if (!bySolver) announce(`Poured tube ${move.from + 1} into tube ${move.to + 1}.`)
    play({ type: 'pour', move, bySolver })
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: tubes,
    step: () => {
      const move = remaining?.[0]
      if (move) pourWithSound(move, true)
      else setSolverMode('off')
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const reject = (tube: number, text: string) => {
    sound.error()
    setRejected({ tube, id: Date.now() })
    setNotice({ tone: 'error', text })
    announce(text)
  }

  const activateTube = (index: number) => {
    if (locked) return
    if (selected === null) {
      if (tubes[index].length === 0) {
        reject(index, `Tube ${index + 1} is empty.`)
        return
      }
      sound.lift()
      act({ type: 'select', tube: index })
      setNotice(null)
      announce(`Tube ${index + 1} picked up.`)
    } else if (selected === index) {
      sound.lift()
      act({ type: 'deselect' })
      announce('Put back.')
    } else {
      const move = { from: selected, to: index }
      if (pourAmount(tubes, move) > 0) pourWithSound(move)
      else reject(index, tubes[index].length >= CAPACITY ? `Tube ${index + 1} is full.` : "The colours don't match.")
    }
  }

  const undo = () => {
    if (locked || history.length === 0) return
    sound.lift()
    setNotice(null)
    play({ type: 'undo' })
    announce('Pour undone.')
  }

  const redo = () => {
    const next = future.at(-1)
    if (locked || !next) return
    setNotice(null)
    pourWithSound(next)
    announce('Pour redone.')
  }

  const noWayOut = () => {
    setNotice({ tone: 'error', text: 'There is no solution from here. Try undoing a few pours.' })
    announce('There is no solution from here. Try undoing a few pours.')
  }

  const showHint = () => {
    if (locked) return
    const move = solve(tubes)?.[0]
    if (!move) {
      noWayOut()
      return
    }
    act({ type: 'hint', move })
    setNotice(null)
    announce(`Hint: pour tube ${move.from + 1} into tube ${move.to + 1}.`)
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    setRejected(null)
    if (next.kind === 'restart') {
      restart()
      announce('Puzzle restarted.')
    } else {
      newPuzzle(next.colors)
      announce(`New puzzle with ${next.colors} colours.`)
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
    if (!solve(tubes)) {
      noWayOut()
      return
    }
    act({ type: 'solver-started' })
    setSolverMode('running')
    setNotice(null)
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

    // Physical key codes, so the number row works on every keyboard layout; 0 is the tenth tube.
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1]
    const tube = digit === undefined ? -1 : digit === '0' ? 9 : Number(digit) - 1
    if (tube >= 0 && tube < tubes.length) {
      if (!event.repeat) activateTube(tube)
    } else if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.water-board'))) {
      document.querySelector<HTMLElement>('.water-board .tube')?.focus()
    } else if (key === 'escape' && selected !== null) {
      act({ type: 'deselect' })
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

  const message = ((): Notice => {
    if (won) {
      return { tone: 'success', text: `${state.solverUsed ? 'Auto-solved' : 'All sorted'} in ${plural(history.length, 'pour')}!` }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text:
          solverMode === 'paused'
            ? 'Auto-solve paused.'
            : `Auto-solving… ${plural(remaining?.length ?? 0, 'pour')} to go.`,
      }
    }
    if (notice) return notice
    if (status === 'stuck') return { tone: 'error', text: 'No pours left. Undo, or start over.' }
    if (hint) return { tone: 'hint', text: `Hint: pour tube ${hint.from + 1} into tube ${hint.to + 1}.` }
    if (selected !== null) return { tone: 'info', text: `Tube ${selected + 1} picked up. Which tube should it pour into?` }
    if (status === 'ready') return { tone: 'info', text: 'Pour until every tube holds just one colour.' }
    return { tone: 'info', text: `${countComplete(tubes)} of ${colors} colours sorted.` }
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
      onClick: () => begin({ kind: 'new', colors }),
    }
    if (colors >= MAX_COLORS) return [{ ...another, primary: true }]
    return [
      another,
      {
        label: `Next: ${colors + 1} colours`,
        trailingIcon: <ChevronRight aria-hidden="true" />,
        primary: true,
        onClick: () => begin({ kind: 'new', colors: colors + 1 }),
      },
    ]
  }

  const record = records[colors]
  const pourDuration = solverActive ? Math.min(POUR_DURATION, solver.speed.interval * 0.85) : POUR_DURATION

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
        <WaterBoard
          tubes={tubes}
          gameId={state.gameId}
          selected={selected}
          hint={hint}
          lastPour={state.lastPour}
          rejected={rejected}
          locked={locked}
          won={won}
          pourDuration={pourDuration}
          reducedMotion={reducedMotion}
          onTubeActivate={activateTube}
        />
      </div>

      <GameControls
        level={
          <Stepper
            label="Number of colours"
            value={colors}
            min={MIN_COLORS}
            max={MAX_COLORS}
            decreaseLabel="Fewer colours"
            increaseLabel="More colours"
            onChange={(next) => requestStart({ kind: 'new', colors: next })}
          >
            <strong>{colors}</strong> colours
          </Stepper>
        }
        onNew={() => requestStart({ kind: 'new', colors })}
        canUndo={!locked && history.length > 0}
        canRedo={!locked && future.length > 0}
        canRestart={history.length > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show a pour to make"
        onUndo={undo}
        onRedo={redo}
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>1</kbd>–<kbd>9</kbd> pick a tube, then where to pour · <kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>H</kbd>{' '}
        hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectNote="That's the fewest pours this puzzle allows."
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.next.kind === 'restart' ? 'Restart this puzzle?' : 'Start a new puzzle?'}
          message={`You'll lose your progress (${plural(history.length, 'pour')} so far).`}
          confirmLabel={dialog.next.kind === 'restart' ? 'Restart' : 'New puzzle'}
          onConfirm={() => begin(dialog.next)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
