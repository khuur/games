import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ChoiceGroup } from '../../components/ChoiceGroup'
import { Confetti } from '../../components/Confetti'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GameControls } from '../../components/GameControls'
import { SolverControls } from '../../components/SolverControls'
import { StatsBar } from '../../components/StatsBar'
import { StatusBar, type StatusTone } from '../../components/StatusBar'
import { WinDialog, type WinAction } from '../../components/WinDialog'
import { useAutoSolver, type SolverMode } from '../../hooks/useAutoSolver'
import { useCelebration } from '../../hooks/useCelebration'
import { useStoredState } from '../../hooks/useStoredState'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import { isBoolean } from '../../lib/storage'
import type { GameProps } from '..'
import type { NonogramAction } from './gameState'
import { NonogramBoard } from './NonogramBoard'
import { FILLED, findHint, LEVEL_IDS, LEVELS, UNKNOWN, type CellState, type Hint, type LevelId } from './nonogram'
import { FILL_MODE_KEY } from './persistence'
import { useNonogramGame } from './useNonogramGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

/** Explains a hint in words; the board marks the line and its cells. Lines may be shown turned, so they are just "lines". */
function describeHint(hint: Hint): string {
  const many = hint.cells.length > 1
  if (hint.kind === 'wrong-cross') {
    return `Hint: ${many ? 'these crosses are on cells' : 'this cross is on a cell'} of the picture. Clear ${many ? 'them' : 'it'}.`
  }
  const fills = hint.states.filter((state) => state === FILLED).length
  if (fills === hint.states.length) {
    return `Hint: however the marked line's numbers fit, they always cover the dotted ${many ? 'cells' : 'cell'}. Fill ${many ? 'them' : 'it'}.`
  }
  if (fills === 0) {
    return `Hint: however the marked line's numbers fit, they never reach the crossed ${many ? 'cells' : 'cell'}, so ${many ? 'those are' : "it's"} empty.`
  }
  return "Hint: however the marked line's numbers fit, the dotted cells are always filled and the crossed ones always empty."
}

export function NonogramGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useNonogramGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, solution, clues, cells, wrong, history, future, mistakes, hint, status } = state
  const level = LEVELS[levelId]
  const [crossMode, setCrossMode] = useStoredState(FILL_MODE_KEY, false, isBoolean)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')
  /** How far the current drag has come, so its notes climb as it goes. */
  const dragNotes = useRef({ stroke: 0, count: 0 })

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const toFill = solution.filter((filled, cell) => filled && cells[cell] !== FILLED).length

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action, and takes note of a mistake or a win. Returns false after a mistake. */
  const play = (action: NonogramAction) => {
    const { previous, next, result } = act(action)
    if (next === previous) return true
    const madeMistake = next.mistakes > previous.mistakes
    if (madeMistake) {
      sound.error()
      const text = 'That cell is empty in the picture. It gets a red cross.'
      setNotice({ tone: 'error', text })
      announce(text)
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Picture revealed!')
    }
    return !madeMistake
  }

  const mark = (targets: number[], from: CellState, to: CellState, stroke: number) => {
    if (locked) return false
    const notes = dragNotes.current
    if (notes.stroke !== stroke) dragNotes.current = { stroke, count: 0 }
    const keepGoing = play({ type: 'mark', cells: targets, from, to, stroke })
    if (keepGoing) {
      dragNotes.current.count += targets.length
      if (to === FILLED) sound.digit(1 + ((dragNotes.current.count - 1) % 9), false)
      else sound.digit(1 + ((dragNotes.current.count - 1) % 9), true)
      setNotice(null)
    }
    return keepGoing
  }

  const undo = () => {
    if (locked || history.length === 0) return
    sound.lift()
    play({ type: 'undo' })
    announce('Undone.')
  }

  const redo = () => {
    if (locked || future.length === 0) return
    sound.lift()
    play({ type: 'redo' })
    announce('Redone.')
  }

  /** The changes a hint stands for: crosses to clear, or the cells a line proves. */
  const changesFor = (next: Hint) =>
    next.kind === 'wrong-cross'
      ? next.cells.map((cell) => ({ cell, to: UNKNOWN as CellState }))
      : next.cells.map((cell, i) => ({ cell, to: next.states[i] }))

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: cells,
    step: () => {
      const next = findHint(level, clues, solution, cells)
      if (!next) {
        setSolverMode('off')
        return
      }
      const changes = changesFor(next)
      const fills = changes.filter(({ to }) => to === FILLED).length
      sound.digit(Math.min(9, 1 + fills), fills === 0)
      play({ type: 'apply', changes, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(level, clues, solution, cells)
    if (!next) return
    play({ type: 'hint', hint: next })
    setNotice(null)
    announce(describeHint(next))
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    if (next.kind === 'restart') {
      restart()
      announce('Puzzle restarted.')
    } else {
      newGame(next.levelId)
      announce(`New ${LEVELS[next.levelId].name} picture, ${LEVELS[next.levelId].columns} by ${LEVELS[next.levelId].rows}.`)
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
    play({ type: 'solver-started' })
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.nono-grid'))) {
      // Arrow keys anywhere else jump into the grid, ready to move around it.
      document.querySelector<HTMLElement>('.nono-grid [tabindex="0"]')?.focus()
    } else if (key === 'c' && !event.repeat) {
      setCrossMode(!crossMode)
      announce(crossMode ? 'Taps fill cells.' : 'Taps cross cells out.')
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved. There is the picture.' }
      return {
        tone: 'success',
        text: mistakes === 0 ? 'Picture revealed, without a single mistake!' : `Picture revealed, with ${plural(mistakes, 'mistake')}.`,
      }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(toFill, 'cell')} to fill.`,
      }
    }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint) }
    if (status === 'ready') {
      return {
        tone: 'info',
        text: 'Each number is a run of filled cells, in order, with gaps between. Drag to mark several cells.',
      }
    }
    if (crossMode) return { tone: 'info', text: 'Taps cross out cells you know are empty.' }
    return { tone: 'info', text: `${plural(toFill, 'cell')} of the picture still to fill.` }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [
        { label: 'Try it yourself', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin({ kind: 'restart' }) },
      ]
    }
    const another: WinAction = {
      label: 'New picture',
      icon: <Shuffle aria-hidden="true" />,
      onClick: () => begin({ kind: 'new', levelId }),
    }
    const nextLevel = LEVEL_IDS[LEVEL_IDS.indexOf(levelId) + 1]
    if (!nextLevel) return [{ ...another, primary: true }]
    return [
      another,
      {
        label: `Next: ${LEVELS[nextLevel].name}`,
        trailingIcon: <ChevronRight aria-hidden="true" />,
        primary: true,
        onClick: () => begin({ kind: 'new', levelId: nextLevel }),
      },
    ]
  }

  const record = records[levelId]

  return (
    <>
      <StatsBar
        progress={{ label: 'Mistakes', value: String(mistakes), note: `${toFill} to fill` }}
        elapsedMs={elapsedMs}
        status={status}
        timerPaused={solverActive || dialog !== null || paused}
        bestTimeMs={record?.timeMs}
        bestNote={record ? `${record.solved} revealed` : ''}
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
        <NonogramBoard
          level={level}
          clues={clues}
          cells={cells}
          wrong={wrong}
          solution={solution}
          hint={hint}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
          crossMode={crossMode}
          onToggleMode={() => setCrossMode(!crossMode)}
          onMark={mark}
        />
      </div>

      <GameControls
        level={
          <ChoiceGroup
            label="Level"
            options={LEVEL_OPTIONS}
            value={levelId}
            onChange={(next) => requestStart({ kind: 'new', levelId: next })}
          />
        }
        onNew={() => requestStart({ kind: 'new', levelId })}
        onUndo={undo}
        onRedo={redo}
        canUndo={!locked && history.length > 0}
        canRedo={!locked && future.length > 0}
        canRestart={history.length > 0 || mistakes > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show what a line proves"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>F</kbd> fill · <kbd>X</kbd> cross · <kbd>C</kbd> switch
        taps · right-click crosses · <kbd>Z</kbd> undo · <kbd>H</kbd> hint
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Flawless!"
          solvedTitle="Picture revealed!"
          perfectNote="Not a single wrong cell, start to finish."
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.next.kind === 'restart' ? 'Restart this picture?' : 'Start a new picture?'}
          message={`You'll lose your progress (${plural(history.length, 'move')} so far).`}
          confirmLabel={dialog.next.kind === 'restart' ? 'Restart' : 'New picture'}
          onConfirm={() => begin(dialog.next)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
