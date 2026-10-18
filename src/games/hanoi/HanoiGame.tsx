import { ChevronRight, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
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
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import { Board, type RejectedMove } from './Board'
import type { GameAction } from './gameState'
import {
  MAX_DISKS,
  MIN_DISKS,
  minimumMoves,
  movesToSolve,
  nextOptimalMove,
  topDisk,
  validateMove,
  type Move,
} from './hanoi'
import { useHanoiGame } from './useHanoiGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; diskCount: number } | null

interface Notice {
  tone: StatusTone
  text: string
}

export function HanoiGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame } = useHanoiGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { towers, diskCount, selected, hint, history, future, status } = state
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [rejected, setRejected] = useState<RejectedMove | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  /** Plays a move-like action and takes note when it wins the game. */
  const play = (action: GameAction) => {
    const result = act(action)
    if (!result) return
    setWinResult(result)
    announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'Solved'} in ${plural(result.moves, 'move')}!`)
  }

  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: towers,
    step: () => {
      const move = nextOptimalMove(towers)
      if (move) play({ type: 'move', move, bySolver: true })
    },
  })

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2800)
    return () => clearTimeout(timer)
  }, [notice])

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const reject = (tower: number, text: string, disk?: number) => {
    sound.error()
    setRejected({ id: Date.now(), tower, disk })
    setNotice({ tone: 'error', text })
    announce(text)
  }

  const tryMove = (move: Move) => {
    const disk = topDisk(towers[move.from])
    const error = validateMove(towers, move)
    if (error === 'larger-on-smaller') {
      reject(move.to, `Disk ${disk} can't go on top of disk ${topDisk(towers[move.to])}.`, disk)
      return
    }
    if (error) return
    setNotice(null)
    announce(`Disk ${disk} moved to tower ${move.to + 1}.`)
    play({ type: 'move', move })
  }

  const activateTower = (tower: number) => {
    if (locked) return
    if (selected === null) {
      const disk = topDisk(towers[tower])
      if (disk === undefined) {
        reject(tower, `Tower ${tower + 1} is empty.`)
        return
      }
      sound.pick(disk, diskCount)
      act({ type: 'select', tower })
      setNotice(null)
      announce(`Disk ${disk} picked up from tower ${tower + 1}.`)
    } else if (selected === tower) {
      act({ type: 'deselect' })
      announce('Disk put back.')
    } else {
      tryMove({ from: selected, to: tower })
    }
  }

  const handleDragStart = (tower: number) => {
    const disk = topDisk(towers[tower])
    if (disk !== undefined && selected !== tower) sound.pick(disk, diskCount)
    act({ type: 'deselect' })
    setNotice(null)
  }

  const handleDrop = (from: number, to: number) => {
    if (from !== to) tryMove({ from, to })
  }

  const handleDiskLand = useCallback((size: number) => sound.drop(size, diskCount), [diskCount])

  const undo = () => {
    if (locked || history.length === 0) return
    act({ type: 'undo' })
    setNotice(null)
    announce('Move undone.')
  }

  const redo = () => {
    if (locked || future.length === 0) return
    setNotice(null)
    announce('Move redone.')
    play({ type: 'redo' })
  }

  const showHint = () => {
    if (locked) return
    const move = nextOptimalMove(towers)
    if (!move) return
    act({ type: 'hint' })
    setNotice(null)
    announce(`Hint: move disk ${topDisk(towers[move.from])} from tower ${move.from + 1} to tower ${move.to + 1}.`)
  }

  const startGame = (count: number) => {
    setSolverMode('off')
    setNotice(null)
    setRejected(null)
    setDialog(null)
    newGame(count)
    announce(`New game with ${count} disks.`)
  }

  const requestNewGame = (count: number) => {
    if (status === 'playing' && history.length >= CONFIRM_AFTER_MOVES) setDialog({ kind: 'confirm', diskCount: count })
    else startGame(count)
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

    // Physical key codes, so the number row works on every keyboard layout.
    const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code)?.[1]
    if (digit) {
      if (!event.repeat) activateTower(Number(digit) - 1)
    } else if (key === 'escape' && selected !== null) {
      act({ type: 'deselect' })
      announce('Disk put back.')
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
    if (notice) return notice
    if (won) {
      const verb = state.solverUsed ? 'Auto-solved' : 'Solved'
      return { tone: 'success', text: `${verb} in ${plural(history.length, 'move')}!` }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text:
          solverMode === 'paused'
            ? 'Auto-solve paused.'
            : `Auto-solving… ${plural(movesToSolve(towers), 'move')} to go.`,
      }
    }
    if (hint) return { tone: 'hint', text: `Hint: move disk ${topDisk(towers[hint.from])} to tower ${hint.to + 1}.` }
    if (selected !== null) {
      return { tone: 'info', text: `Disk ${topDisk(towers[selected])} picked up. Where should it go?` }
    }
    if (status === 'ready') return { tone: 'info', text: 'Move the whole tower to the goal peg on the right.' }
    return { tone: 'info', text: 'One disk at a time, never onto a smaller disk.' }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    const again: WinAction = {
      label: result.assistedBy === 'solver' ? 'Try it yourself' : 'Play again',
      icon: <RotateCcw aria-hidden="true" />,
      onClick: () => startGame(diskCount),
    }
    if (result.assistedBy === 'solver' || diskCount >= MAX_DISKS) return [{ ...again, primary: true }]
    return [
      again,
      {
        label: `Next: ${diskCount + 1} disks`,
        trailingIcon: <ChevronRight aria-hidden="true" />,
        primary: true,
        onClick: () => startGame(diskCount + 1),
      },
    ]
  }

  const record = records[diskCount]

  return (
    <>
      <StatsBar
        progress={{ label: 'Moves', value: String(history.length), note: `Minimum ${minimumMoves(diskCount)}` }}
        elapsedMs={elapsedMs}
        status={status}
        timerPaused={solverActive || dialog !== null || paused}
        bestTimeMs={record?.timeMs}
        bestNote={record ? `Fewest moves ${record.moves}` : ''}
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
        <Board
          towers={towers}
          diskCount={diskCount}
          gameId={state.gameId}
          selected={selected}
          hint={hint}
          locked={locked}
          won={won}
          rejected={rejected}
          maxMoveDuration={solverActive ? solver.speed.interval * 0.8 : undefined}
          reducedMotion={reducedMotion}
          onTowerActivate={activateTower}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onDiskLand={handleDiskLand}
        />
      </div>

      <GameControls
        level={
          <Stepper
            label="Number of disks"
            value={diskCount}
            min={MIN_DISKS}
            max={MAX_DISKS}
            decreaseLabel="Fewer disks"
            increaseLabel="More disks"
            onChange={requestNewGame}
          >
            <strong>{diskCount}</strong> disks
          </Stepper>
        }
        canUndo={!locked && history.length > 0}
        canRedo={!locked && future.length > 0}
        canRestart={history.length > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show the best next move"
        onUndo={undo}
        onRedo={redo}
        onRestart={() => requestNewGame(diskCount)}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> move · <kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>H</kbd> hint ·{' '}
        <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectNote={
            <>
              That&apos;s the shortest possible solution: 2<sup>{diskCount}</sup> − 1 = {minimumMoves(diskCount)} moves.
            </>
          }
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title="Start a new game?"
          message={`You'll lose your current game (${plural(history.length, 'move')} so far).`}
          confirmLabel="New game"
          onConfirm={() => startGame(dialog.diskCount)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
