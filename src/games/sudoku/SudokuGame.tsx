import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
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
import { isEditable, type SudokuAction } from './gameState'
import { columnOf, findHint, LEVEL_IDS, LEVELS, rowOf, unitKind, type Hint, type LevelId, type Technique } from './sudoku'
import { SudokuBoard } from './SudokuBoard'
import { useSudokuGame } from './useSudokuGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

const PATTERN_NAMES: Partial<Record<Technique, string>> = {
  pointing: 'a pointing pair',
  claiming: 'a box-line reduction',
  'naked-pair': 'a naked pair',
  'hidden-pair': 'a hidden pair',
  'naked-triple': 'a naked triple',
}

/** "a 5", but "an 8". */
const aDigit = (digit: number) => `${digit === 8 ? 'an' : 'a'} ${digit}`

/** Explains a hint in words; the board marks the cell (and, for a hidden single, where to look). */
function describeHint(hint: Hint): string {
  if (hint.kind === 'wrong') return `Hint: the ${hint.digit} here is wrong. Erase it to carry on.`
  if (hint.patterns.length) {
    const names = hint.patterns.map((pattern) => PATTERN_NAMES[pattern]).join(' and ')
    return `Hint: the marked cell must be ${aDigit(hint.digit)}. Spotting it takes ${names}, which rules out the other options first.`
  }
  if (hint.technique === 'hidden-single' && hint.unit !== undefined) {
    return `Hint: in this ${unitKind(hint.unit)}, ${aDigit(hint.digit)} fits in only one place.`
  }
  return `Hint: only ${hint.digit} fits the marked cell. Its row, column and box hold every other digit.`
}

const describeCell = (cell: number) => `row ${rowOf(cell) + 1}, column ${columnOf(cell) + 1}`

export function SudokuGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useSudokuGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, givens, solution, values, notes, history, future, mistakes, hint, status } = state
  const [selected, setSelected] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const empty = values.filter((value) => value === 0).length

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action with its sound, and takes note of finished units and a win. */
  const play = (action: SudokuAction) => {
    const { next, result } = act(action)
    if (next === state) return false
    if (action.type === 'enter' && action.digit && !action.note) {
      if (next.values[action.cell] !== solution[action.cell]) sound.error()
      else if (next.lastMove?.completed.length) {
        sound.digit(action.digit, false)
        sound.chime()
      } else sound.digit(action.digit, false)
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Puzzle solved!')
    }
    return true
  }

  const enter = (digit: number, asNote = notesMode) => {
    if (locked) return
    if (selected === null) {
      setNotice({ tone: 'info', text: 'Pick a cell first.' })
      return
    }
    if (givens[selected]) {
      setNotice({ tone: 'info', text: 'That digit is part of the puzzle, so it stays.' })
      return
    }
    if (!isEditable(state, selected)) {
      setNotice({ tone: 'info', text: 'That cell is already solved.' })
      return
    }
    if (asNote && values[selected]) {
      setNotice({ tone: 'info', text: 'Erase the digit first to pencil in notes.' })
      return
    }
    setNotice(null)
    if (asNote) {
      sound.digit(digit, true)
      play({ type: 'enter', cell: selected, digit, note: true })
      return
    }
    const wrong = digit !== solution[selected] && digit !== values[selected]
    if (play({ type: 'enter', cell: selected, digit }) && wrong) {
      const text = `That ${digit} doesn't belong there.`
      setNotice({ tone: 'error', text })
      announce(text)
    } else {
      announce(`${digit} in ${describeCell(selected)}.`)
    }
  }

  const erase = () => {
    if (locked || selected === null || !isEditable(state, selected)) return
    if (play({ type: 'enter', cell: selected, digit: 0 })) {
      sound.lift()
      setNotice(null)
    }
  }

  const undo = () => {
    if (locked || history.length === 0) return
    const cell = history.at(-1)!.cell
    sound.lift()
    play({ type: 'undo' })
    setSelected(cell)
    setNotice(null)
    announce('Undone.')
  }

  const redo = () => {
    const move = future.at(-1)
    if (locked || !move) return
    sound.lift()
    play({ type: 'redo' })
    setSelected(move.cell)
    setNotice(null)
    announce('Redone.')
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: values,
    step: () => {
      const next = findHint(values, solution)
      if (!next) {
        setSolverMode('off')
        return
      }
      setSelected(next.cell)
      play({ type: 'enter', cell: next.cell, digit: next.kind === 'wrong' ? 0 : next.digit, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(values, solution)
    if (!next) return
    play({ type: 'hint', hint: next })
    setSelected(next.cell)
    setNotice(null)
    announce(`${describeHint(next)} It is in ${describeCell(next.cell)}.`)
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    setSelected(null)
    if (next.kind === 'restart') {
      restart()
      announce('Puzzle restarted.')
    } else {
      newGame(next.levelId)
      announce(`New ${LEVELS[next.levelId].name} puzzle.`)
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

  const toggleNotes = () => {
    setNotesMode((on) => !on)
    announce(notesMode ? 'Notes off.' : 'Notes on: digits go in as pencil marks.')
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

    // Physical key codes, so the number row works on every keyboard layout (and with Shift held).
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1]
    if (digit === '0') {
      erase()
    } else if (digit !== undefined) {
      // Shift flips between digits and notes for one key press.
      if (!event.repeat) enter(Number(digit), notesMode !== event.shiftKey)
    } else if (key === 'backspace' || key === 'delete') {
      erase()
    } else if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.sudoku-grid'))) {
      // Arrow keys anywhere else jump into the grid, ready to move around it.
      if (selected === null) setSelected(40)
      document.querySelector<HTMLElement>('.sudoku-grid [tabindex="0"]')?.focus()
    } else if (key === 'escape' && selected !== null) {
      setSelected(null)
    } else if (key === 'n' && !event.repeat) {
      toggleNotes()
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved.' }
      return {
        tone: 'success',
        text: mistakes === 0 ? 'Solved without a single mistake!' : `Solved, with ${plural(mistakes, 'mistake')}.`,
      }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(empty, 'cell')} to go.`,
      }
    }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint) }
    if (notesMode) return { tone: 'info', text: 'Notes on: digits go in as small pencil marks.' }
    if (status === 'ready') {
      return { tone: 'info', text: 'Fill the grid so every row, column and box holds 1 to 9. Pick a cell, then a digit.' }
    }
    return { tone: 'info', text: `${plural(empty, 'cell')} to go.` }
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
        <SudokuBoard
          givens={givens}
          solution={solution}
          values={values}
          notes={notes}
          selected={selected}
          hint={hint}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
          notesMode={notesMode}
          canUndo={!locked && history.length > 0}
          canRedo={!locked && future.length > 0}
          onSelect={(cell) => {
            if (!locked) setSelected(cell)
          }}
          onDigit={(digit) => enter(digit)}
          onErase={erase}
          onToggleNotes={toggleNotes}
          onUndo={undo}
          onRedo={redo}
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
        canRestart={history.length > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show the next digit, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>1</kbd>–<kbd>9</kbd> enter · <kbd>N</kbd> notes ·{' '}
        <kbd>⌫</kbd> erase · <kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Flawless!"
          perfectNote="Not a single wrong digit, start to finish."
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
