import { CircleHelp, Gauge, Moon, Pause, Play, Sun, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Board, type RejectedMove } from './components/Board'
import { Confetti } from './components/Confetti'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Controls } from './components/Controls'
import { HelpDialog } from './components/HelpDialog'
import { Logo } from './components/Logo'
import { StatsBar } from './components/StatsBar'
import { StatusBar, type StatusTone } from './components/StatusBar'
import { WinDialog } from './components/WinDialog'
import type { GameAction } from './game/gameState'
import { MAX_DISKS, minimumMoves, movesToSolve, nextOptimalMove, topDisk, validateMove, type Move } from './game/hanoi'
import { useHanoiGame, type WinResult } from './game/useHanoiGame'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useStoredState } from './hooks/useStoredState'
import { useTheme } from './hooks/useTheme'
import { plural } from './lib/format'
import { sound } from './lib/sound'
import { isBoolean } from './lib/storage'
import './App.css'

const SOLVER_SPEEDS = [
  { label: '0.5×', interval: 1100 },
  { label: '1×', interval: 650 },
  { label: '2×', interval: 340 },
  { label: '4×', interval: 170 },
  { label: '8×', interval: 75 },
]

const isSpeedIndex = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < SOLVER_SPEEDS.length

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

type SolverMode = 'off' | 'running' | 'paused'

type OpenDialog =
  | { kind: 'help' }
  | { kind: 'win'; result: WinResult }
  | { kind: 'confirm'; diskCount: number }
  | null

interface Message {
  tone: StatusTone
  text: ReactNode
}

export default function App() {
  const [solver, setSolver] = useState<SolverMode>('off')
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const { state, act, elapsedMs, records, newGame } = useHanoiGame({
    timerPaused: solver !== 'off' || dialog !== null,
  })
  const { towers, diskCount, selected, hint, history, future, status } = state
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const { theme, toggleTheme } = useTheme()
  const [soundOn, setSoundOn] = useStoredState('sound', true, isBoolean)
  const [speedIndex, setSpeedIndex] = useStoredState('speed', 2, isSpeedIndex)
  const [notice, setNotice] = useState<Message | null>(null)
  const [rejected, setRejected] = useState<RejectedMove | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [confettiBurst, setConfettiBurst] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solver !== 'off' && !won
  const locked = solverActive || won
  const speed = SOLVER_SPEEDS[speedIndex]

  useEffect(() => {
    sound.enabled = soundOn
  }, [soundOn])

  useEffect(() => {
    const unlockAudio = () => sound.unlock()
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2800)
    return () => clearTimeout(timer)
  }, [notice])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  /** Plays a move-like action and takes note when it wins the game. */
  const play = (action: GameAction) => {
    const result = act(action)
    if (!result) return
    setWinResult(result)
    announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'Solved'} in ${plural(result.moves, 'move')}!`)
  }

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
    setSolver('off')
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
      setSolver('off')
      announce('Auto-solve stopped.')
      return
    }
    if (won) return
    act({ type: 'solver-started' })
    setSolver('running')
    setNotice(null)
    announce('Auto-solving.')
  }

  const solverStep = useEffectEvent(() => {
    const move = nextOptimalMove(towers)
    if (move) play({ type: 'move', move, bySolver: true })
  })

  // The auto-solver plays one optimal move per tick, always computed from the live position.
  useEffect(() => {
    if (solver !== 'running' || won || dialog) return
    const timer = setTimeout(() => solverStep(), speed.interval)
    return () => clearTimeout(timer)
  }, [solver, won, dialog, towers, speed.interval])

  const playFanfare = useEffectEvent(() => {
    sound.win()
    if (!reducedMotion) setConfettiBurst((burst) => burst + 1)
  })

  const showResults = useEffectEvent(() => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  // A win gets a moment on the board (the stack hops, confetti flies) before the results appear.
  useEffect(() => {
    if (!won) return
    const fanfare = setTimeout(() => playFanfare(), 450)
    const results = setTimeout(() => showResults(), 1600)
    return () => {
      clearTimeout(fanfare)
      clearTimeout(results)
    }
  }, [won])

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || dialog) return
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
    } else if (key === 'm' && !event.repeat) {
      setSoundOn((on) => !on)
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

  const message = ((): Message => {
    if (notice) return notice
    if (won) {
      const verb = state.solverUsed ? 'Auto-solved' : 'Solved'
      return { tone: 'success', text: `${verb} in ${plural(history.length, 'move')}!` }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solver === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(movesToSolve(towers), 'move')} to go.`,
      }
    }
    if (hint) return { tone: 'hint', text: `Hint: move disk ${topDisk(towers[hint.from])} to tower ${hint.to + 1}.` }
    if (selected !== null) {
      return { tone: 'info', text: `Disk ${topDisk(towers[selected])} picked up. Where should it go?` }
    }
    if (status === 'ready') return { tone: 'info', text: 'Move the whole tower to the goal peg on the right.' }
    return { tone: 'info', text: 'One disk at a time, never onto a smaller disk.' }
  })()

  const solverControls = solverActive && (
    <>
      <button
        type="button"
        className="icon-button small"
        onClick={() => setSolver((mode) => (mode === 'running' ? 'paused' : 'running'))}
        aria-label={solver === 'paused' ? 'Resume auto-solve' : 'Pause auto-solve'}
        title={solver === 'paused' ? 'Resume' : 'Pause'}
      >
        {solver === 'paused' ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
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
          onChange={(event) => setSpeedIndex(Number(event.target.value))}
          aria-valuetext={speed.label}
        />
        <output aria-hidden="true">{speed.label}</output>
      </label>
    </>
  )

  let timeNote = ''
  if (status === 'ready') timeNote = 'Not started'
  else if (status === 'playing' && (solver !== 'off' || dialog !== null)) timeNote = 'Paused'

  const closeDialog = () => setDialog(null)

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <Logo />
          <h1>Tower of Hanoi</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setDialog({ kind: 'help' })}
            aria-label="How to play"
            title="How to play"
          >
            <CircleHelp aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSoundOn(!soundOn)}
            aria-label="Sound"
            aria-pressed={soundOn}
            title={soundOn ? 'Mute (M)' : 'Unmute (M)'}
          >
            {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label="Dark theme"
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="game">
        <StatsBar
          moves={history.length}
          minimum={minimumMoves(diskCount)}
          elapsedMs={elapsedMs}
          timeNote={timeNote}
          record={records[diskCount]}
        />

        <StatusBar tone={message.tone} actions={solverControls || undefined}>
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
            maxMoveDuration={solverActive ? speed.interval * 0.8 : undefined}
            reducedMotion={reducedMotion}
            onTowerActivate={activateTower}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDiskLand={handleDiskLand}
          />
        </div>

        <Controls
          diskCount={diskCount}
          canUndo={!locked && history.length > 0}
          canRedo={!locked && future.length > 0}
          canRestart={history.length > 0}
          canHint={!locked}
          canSolve={!won}
          solverActive={solverActive}
          onDiskCountChange={requestNewGame}
          onUndo={undo}
          onRedo={redo}
          onRestart={() => requestNewGame(diskCount)}
          onHint={showHint}
          onToggleSolver={toggleSolver}
        />
      </main>

      <footer className="app-footer">
        <p className="keyboard-hint">
          <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> move · <kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>H</kbd> hint ·{' '}
          <kbd>M</kbd> sound
        </p>
      </footer>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'help' && <HelpDialog onClose={closeDialog} />}
      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          onClose={closeDialog}
          onPlayAgain={() => startGame(diskCount)}
          onNextLevel={diskCount < MAX_DISKS ? () => startGame(diskCount + 1) : undefined}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title="Start a new game?"
          message={`You'll lose your current game (${plural(history.length, 'move')} so far).`}
          confirmLabel="New game"
          onConfirm={() => startGame(dialog.diskCount)}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}
