import { ChevronRight, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react'
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
import { isEditable, type LatinAction, type LatinState } from './latin'
import { LatinBoard, type ClueRing } from './LatinBoard'
import { useLatinSession, type LatinSessionConfig } from './useLatinSession'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

export type LatinGameAction<H, L extends string, P> = LatinAction<H> | { type: 'new-game'; levelId: L; puzzle: P }

export interface LatinGameConfig<H, S extends LatinState<H> & { levelId: L }, L extends string, P> {
  session: LatinSessionConfig<S, LatinGameAction<H, L, P>, L>
  levels: readonly { value: L; label: string }[]
  /** The cell a hint is about, the digit it leads to (0 to erase), and whether it is a wrong digit. */
  hintTarget: (hint: H) => { cell: number; digit: number; wrong: boolean }
  findHint: (state: S) => H | null
  /** Cells the hint's reasoning is about, to shade on the board. */
  hintArea: (hint: H, state: S) => number[]
  describeHint: (hint: H, state: S) => string
  ring?: (state: S) => ClueRing
  /** Heavy lines over the grid (an SVG path in cells) and corner labels, such as cages and their targets. */
  decorations?: (state: S) => { outline?: string; labelOf?: (cell: number) => string | undefined }
  readyText: string
  /** Announced when a new puzzle starts. */
  newPuzzleText: (levelId: L) => string
  perfectNote: string
  keyboardHint?: ReactNode
}

/** Builds a Latin-square game from its puzzles, hints and decorations. */
export function createLatinGame<H, S extends LatinState<H> & { levelId: L }, L extends string, P>(
  config: LatinGameConfig<H, S, L, P>,
) {
  return function LatinGame({ paused }: GameProps) {
    const [dialog, setDialog] = useState<{ kind: 'win'; result: WinResult } | { kind: 'confirm'; next: 'restart' | L } | null>(null)
    const [solverMode, setSolverMode] = useState<SolverMode>('off')
    const { state, act, elapsedMs, records, newGame, restart } = useLatinSession<H, S, LatinGameAction<H, L, P>, L>(
      config.session,
      solverMode !== 'off' || dialog !== null || paused,
    )
    const { levelId, givens, solution, values, notes, history, future, mistakes, hint, status, size } = state
    const [selected, setSelected] = useState<number | null>(null)
    const [notesMode, setNotesMode] = useState(false)
    const [notice, setNotice] = useState<{ tone: StatusTone; text: string } | null>(null)
    const [winResult, setWinResult] = useState<WinResult | null>(null)
    const [announcement, setAnnouncement] = useState('')

    const won = status === 'won'
    const solverActive = solverMode !== 'off' && !won
    const locked = solverActive || won
    const empty = values.filter((value) => value === 0).length
    const target = hint ? config.hintTarget(hint) : null
    const hintArea = useMemo(() => new Set(hint ? config.hintArea(hint, state) : []), [hint, state])
    const ring = config.ring?.(state)
    const decorations = config.decorations?.(state)

    /** Screen readers only re-read a live region when its text changes. */
    const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

    useEffect(() => {
      if (!notice) return
      const timer = setTimeout(() => setNotice(null), 3200)
      return () => clearTimeout(timer)
    }, [notice])

    /** Plays an action with its sound, and takes note of finished lines and a win. */
    const play = (action: LatinGameAction<H, L, P>) => {
      const { next, result } = act(action)
      if (next === state) return false
      if (action.type === 'enter' && action.digit && !action.note) {
        if (next.values[action.cell] !== solution[action.cell]) sound.error()
        else {
          sound.digit(action.digit, false)
          if (next.lastMove?.completed.length) sound.chime()
        }
      }
      if (result) {
        setWinResult(result)
        announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Puzzle solved!')
      }
      return true
    }

    const describeCell = (cell: number) => `row ${Math.floor(cell / size) + 1}, column ${(cell % size) + 1}`

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
        const next = config.findHint(state)
        if (!next) {
          setSolverMode('off')
          return
        }
        const { cell, digit, wrong } = config.hintTarget(next)
        setSelected(cell)
        play({ type: 'enter', cell, digit: wrong ? 0 : digit, bySolver: true })
      },
    })

    const confettiBurst = useCelebration(won, () => {
      if (winResult) setDialog({ kind: 'win', result: winResult })
    })

    const showHint = () => {
      if (locked) return
      const next = config.findHint(state)
      if (!next) return
      play({ type: 'hint', hint: next })
      setSelected(config.hintTarget(next).cell)
      setNotice(null)
      announce(config.describeHint(next, state))
    }

    const begin = (next: 'restart' | L) => {
      setSolverMode('off')
      setDialog(null)
      setNotice(null)
      setSelected(null)
      if (next === 'restart') {
        restart()
        announce('Puzzle restarted.')
      } else {
        newGame(next)
        announce(config.newPuzzleText(next))
      }
    }

    const requestStart = (next: 'restart' | L) => {
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
      const eventTarget = event.target
      if (eventTarget instanceof Element && eventTarget.closest('input, select, textarea, [contenteditable="true"]')) return
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
      } else if (digit !== undefined && Number(digit) <= size) {
        // Shift flips between digits and notes for one key press.
        if (!event.repeat) enter(Number(digit), notesMode !== event.shiftKey)
      } else if (key === 'backspace' || key === 'delete') {
        erase()
      } else if (key.startsWith('arrow') && !(eventTarget instanceof Element && eventTarget.closest('.lt-grid'))) {
        // Arrow keys anywhere else jump into the grid, ready to move around it.
        if (selected === null) setSelected(0)
        document.querySelector<HTMLElement>('.lt-grid [tabindex="0"]')?.focus()
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

    const message = ((): { tone: StatusTone; text: string } => {
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
      if (hint) return { tone: 'hint', text: config.describeHint(hint, state) }
      if (notesMode) return { tone: 'info', text: 'Notes on: digits go in as small pencil marks.' }
      if (status === 'ready') return { tone: 'info', text: config.readyText }
      return { tone: 'info', text: `${plural(empty, 'cell')} to go.` }
    })()

    const winActions = (result: WinResult): WinAction[] => {
      if (result.assistedBy === 'solver') {
        return [{ label: 'Try it yourself', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin('restart') }]
      }
      const another: WinAction = { label: 'New puzzle', icon: <Shuffle aria-hidden="true" />, onClick: () => begin(levelId) }
      const index = config.levels.findIndex((level) => level.value === levelId)
      const nextLevel = config.levels[index + 1]
      if (!nextLevel) return [{ ...another, primary: true }]
      return [
        another,
        {
          label: `Next: ${nextLevel.label}`,
          trailingIcon: <ChevronRight aria-hidden="true" />,
          primary: true,
          onClick: () => begin(nextLevel.value),
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
          <LatinBoard
            size={size}
            givens={givens}
            solution={solution}
            values={values}
            notes={notes}
            selected={selected}
            hintCell={target?.cell ?? null}
            hintWrong={target?.wrong ?? false}
            hintArea={hintArea}
            lastMove={state.lastMove}
            gameId={state.gameId}
            won={won}
            locked={locked}
            notesMode={notesMode}
            canUndo={!locked && history.length > 0}
            canRedo={!locked && future.length > 0}
            ring={ring}
            outline={decorations?.outline}
            labelOf={decorations?.labelOf}
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
          level={<ChoiceGroup label="Level" options={config.levels} value={levelId} onChange={(next) => requestStart(next)} />}
          onNew={() => requestStart(levelId)}
          canRestart={history.length > 0}
          canHint={!locked}
          canSolve={!won}
          solverActive={solverActive}
          hintTitle="Show the next digit, and why"
          onRestart={() => requestStart('restart')}
          onHint={showHint}
          onToggleSolver={toggleSolver}
        />

        <p className="keyboard-hint">
          {config.keyboardHint ?? (
            <>
              <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>1</kbd>–<kbd>{size}</kbd> enter · <kbd>N</kbd> notes ·{' '}
              <kbd>⌫</kbd> erase · <kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>M</kbd> sound
            </>
          )}
        </p>

        <div className="sr-only" role="status">
          {announcement}
        </div>
        <Confetti burst={confettiBurst} />

        {dialog?.kind === 'win' && (
          <WinDialog
            result={dialog.result}
            perfectTitle="Flawless!"
            perfectNote={config.perfectNote}
            actions={winActions(dialog.result)}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === 'confirm' && (
          <ConfirmDialog
            title={dialog.next === 'restart' ? 'Restart this puzzle?' : 'Start a new puzzle?'}
            message={`You'll lose your progress (${plural(history.length, 'move')} so far).`}
            confirmLabel={dialog.next === 'restart' ? 'Restart' : 'New puzzle'}
            onConfirm={() => begin(dialog.next)}
            onCancel={() => setDialog(null)}
          />
        )}
      </>
    )
  }
}
