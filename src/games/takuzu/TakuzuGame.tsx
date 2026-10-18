import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useState } from 'react'
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
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import { cycled, sizeOf, type TakuzuAction } from './gameState'
import { TakuzuBoard } from './TakuzuBoard'
import { EMPTY, findHint, LEVEL_IDS, LEVELS, MOON, problemCells, SUN, type Cell, type Hint, type LevelId } from './takuzu'
import { useTakuzuGame } from './useTakuzuGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

const name = (value: Cell, count = 1) => (value === SUN ? (count === 1 ? 'sun' : 'suns') : count === 1 ? 'moon' : 'moons')

/** Explains a hint in words; the board marks the cells it refers to. */
function describeHint(hint: Hint, size: number): string {
  if (hint.kind === 'wrong') {
    return hint.cells.length > 1 ? 'Hint: the marked cells hold the wrong symbols.' : 'Hint: the marked cell holds the wrong symbol.'
  }
  const { reason, values, cells, line } = hint.step
  const value = values[0]
  const other = value === SUN ? MOON : SUN
  const lineName = line === undefined ? 'line' : line < size ? 'row' : 'column'
  switch (reason) {
    case 'pair':
      return `Hint: two ${name(other, 2)} sit side by side, so the cell next to them must be a ${name(value)}.`
    case 'sandwich':
      return `Hint: a cell between two ${name(other, 2)} must be a ${name(value)}, or there would be three in a row.`
    case 'sign':
      return `Hint: the sign links this cell to its marked neighbour, which makes it a ${name(value)}.`
    case 'count':
      return `Hint: this ${lineName} already has its ${size / 2} ${name(other, 2)}, so the rest ${cells.length > 1 ? 'are' : 'is'} ${cells.length > 1 ? name(value, 2) : `a ${name(value)}`}.`
    case 'line':
      return `Hint: only a few ways of filling the marked ${lineName} follow every rule, and they all agree on the pulsing ${cells.length > 1 ? 'cells' : 'cell'}.`
    case 'lookahead':
      return `Hint: a ${name(other)} here would break a rule a few steps later, so it must be a ${name(value)}.`
  }
}

export function TakuzuGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useTakuzuGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, givens, signs, solution, cells, history, future, mistakes, hint, status } = state
  const size = sizeOf(state)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const empty = cells.filter((value) => value === EMPTY).length
  const problems = useMemo(() => new Set(problemCells(size, cells, signs)), [size, cells, signs])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action with its sound, and takes note of a mistake or a win. */
  const play = (action: TakuzuAction) => {
    const { next, result } = act(action)
    if (next === state) return
    if (next.mistakes > state.mistakes) {
      sound.error()
      const text = 'That breaks a rule: look for the cells marked in red.'
      setNotice({ tone: 'error', text })
      announce(text)
    } else if (next.lastMove && next.lastMove.id !== state.lastMove?.id) {
      const value = next.cells[next.lastMove.cell]
      if (value === SUN) sound.digit(7, false)
      else if (value === MOON) sound.digit(4, false)
      else sound.lift()
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Puzzle solved!')
    }
  }

  const set = (cell: number, value: Cell) => {
    if (locked || givens[cell]) return
    setNotice(null)
    play({ type: 'set', cell, value })
  }

  const cycle = (cell: number, backwards = false) => {
    const now = cells[cell]
    set(cell, backwards ? (now === EMPTY ? MOON : now === MOON ? SUN : EMPTY) : cycled(now))
  }

  const undo = () => {
    if (locked || history.length === 0) return
    sound.lift()
    play({ type: 'undo' })
    announce('Undone.')
  }

  const redo = () => {
    if (locked || future.length === 0) return
    play({ type: 'redo' })
    announce('Redone.')
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: cells,
    step: () => {
      const next = findHint(size, cells, signs, solution)
      if (!next) {
        setSolverMode('off')
        return
      }
      const changes =
        next.kind === 'wrong'
          ? next.cells.map((cell) => ({ cell, value: solution[cell] }))
          : next.step.cells.map((cell, i) => ({ cell, value: next.step.values[i] }))
      sound.digit(changes[0].value === SUN ? 7 : 4, false)
      play({ type: 'apply', changes, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(size, cells, signs, solution)
    if (!next) return
    play({ type: 'hint', hint: next })
    setNotice(null)
    announce(describeHint(next, size))
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
      announce(`New ${LEVELS[next.levelId].name} puzzle, ${LEVELS[next.levelId].size} by ${LEVELS[next.levelId].size}.`)
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.tk-board'))) {
      // Arrow keys anywhere else jump into the grid, ready to move around it.
      document.querySelector<HTMLElement>('.tk-board [tabindex="0"]')?.focus()
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved. Every sun and moon in place.' }
      return {
        tone: 'success',
        text: mistakes === 0 ? 'Solved without breaking a single rule!' : `Solved, with ${plural(mistakes, 'mistake')}.`,
      }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(empty, 'cell')} to go.`,
      }
    }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint, size) }
    if (problems.size) return { tone: 'error', text: 'Something breaks a rule: the cells marked in red.' }
    if (status === 'ready') {
      return {
        tone: 'info',
        text: 'Fill every cell: no three alike in a row, equal suns and moons in every line, = for same and × for opposite.',
      }
    }
    return { tone: 'info', text: `${plural(empty, 'cell')} to fill.` }
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
        progress={{ label: 'Mistakes', value: String(mistakes), note: `${empty} to fill` }}
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
        <TakuzuBoard
          size={size}
          givens={givens}
          signs={signs}
          cells={cells}
          problems={problems}
          hint={hint}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
          onCycle={cycle}
          onSet={set}
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
        canRestart={history.length > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show the next cell you can be sure of, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> cycle · <kbd>1</kbd> sun · <kbd>2</kbd>{' '}
        moon · <kbd>⌫</kbd> clear · <kbd>Z</kbd> undo · <kbd>H</kbd> hint
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Flawless!"
          perfectNote="Not a single broken rule along the way."
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
