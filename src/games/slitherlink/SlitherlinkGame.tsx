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
import type { SlitherlinkAction } from './gameState'
import { SlitherlinkBoard } from './SlitherlinkBoard'
import { CROSS, findHint, LEVEL_IDS, LEVELS, LINE, problemsOf, UNKNOWN, type EdgeState, type Hint, type LevelId } from './slitherlink'
import { useSlitherlinkGame } from './useSlitherlinkGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

/** Explains a hint in words; the board marks the edges, and the clue or dot it is about. */
function describeHint(hint: Hint, clues: readonly number[]): string {
  if (hint.kind === 'wrong') {
    const one = hint.edges.length === 1
    return `Hint: the marked ${one ? 'edge is' : 'edges are'} wrong. Take ${one ? 'it' : 'them'} back.`
  }
  const { reason, cell, tried } = hint.step
  const clue = cell === undefined ? 0 : clues[cell]
  switch (reason) {
    case 'zero':
      return 'Hint: a 0 has no loop around it, so all four of its sides are crossed.'
    case 'clue-full':
      return `Hint: this ${clue} already has ${clue === 1 ? 'its line' : `its ${clue} lines`}, so its other sides are crossed.`
    case 'clue-fill':
      return `Hint: this ${clue} needs every side it has left, so they are all lines.`
    case 'dot-full':
      return 'Hint: two lines already meet at this dot, so no other line can.'
    case 'dot-continue':
      return 'Hint: the loop reaching this dot has only one way to go on.'
    case 'dot-dead':
      return "Hint: this dot has just one open side, and the loop can't stop there, so that side is crossed."
    case 'loop':
      return 'Hint: a line here would close a loop while the rest is unfinished, so it is crossed.'
    case 'local':
      return `Hint: look at this ${clue} and the dots at its corners. Every way to draw them without the loop branching or stopping at a corner agrees on the marked edges.`
    case 'lookahead':
      return tried === LINE
        ? 'Hint: suppose the marked edge were a line. Following the rules from there, the loop soon gets stuck, so it is crossed.'
        : 'Hint: suppose the marked edge were crossed. Following the rules from there, the loop soon gets stuck, so it is a line.'
    case 'reveal':
      return 'Hint: the marked edge is part of the loop.'
  }
}

export function SlitherlinkGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useSlitherlinkGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, clues, solution, edges, history, future, mistakes, hint, status } = state
  const { rows, cols } = LEVELS[levelId]
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const lines = edges.filter((edge) => edge === LINE).length
  const problems = useMemo(() => {
    const found = problemsOf(rows, cols, clues, edges)
    return { cells: new Set(found.cells), dots: new Set(found.dots), loop: new Set(found.loop) }
  }, [rows, cols, clues, edges])
  const boardHint = useMemo(() => {
    if (!hint) return null
    if (hint.kind === 'wrong') return { lines: [], crosses: [], wrong: hint.edges, cells: [], dot: null }
    const { lines: draw, crosses, cell, dot } = hint.step
    return { lines: draw, crosses, wrong: [], cells: cell === undefined ? [] : [cell], dot: dot ?? null }
  }, [hint])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action, and takes note of a broken rule or a win. */
  const play = (action: SlitherlinkAction) => {
    const { previous, next, result } = act(action)
    if (next === previous) return
    if (next.mistakes > previous.mistakes) {
      sound.error()
      const before = problemsOf(rows, cols, clues, previous.edges)
      const after = problemsOf(rows, cols, clues, next.edges)
      const text = after.loop.length && !before.loop.length
        ? 'That closes a loop too soon.'
        : after.dots.some((dot) => !before.dots.includes(dot))
          ? "The loop can't branch or stop at a dot."
          : "That clue can't be met any more."
      setNotice({ tone: 'error', text })
      announce(text)
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Loop closed!')
    }
  }

  const set = (changes: { edge: number; to: EdgeState }[], stroke: number) => {
    if (locked) return
    const to = changes[0]?.to
    if (to === LINE) sound.digit(6, false)
    else if (to === CROSS) sound.digit(3, true)
    else sound.lift()
    setNotice(null)
    play({ type: 'set', changes, stroke })
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

  /** The changes a hint stands for. */
  const changesFor = (next: Hint): { edge: number; to: EdgeState }[] => {
    if (next.kind === 'wrong') return next.edges.map((edge) => ({ edge, to: UNKNOWN }))
    return [...next.step.lines.map((edge) => ({ edge, to: LINE as EdgeState })), ...next.step.crosses.map((edge) => ({ edge, to: CROSS as EdgeState }))]
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: edges,
    step: () => {
      const next = findHint(rows, cols, clues, edges, solution)
      if (!next) {
        setSolverMode('off')
        return
      }
      const changes = changesFor(next)
      if (changes.some(({ to }) => to === LINE)) sound.digit(6, false)
      else sound.digit(3, true)
      play({ type: 'apply', changes, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(rows, cols, clues, edges, solution)
    if (!next) return
    play({ type: 'hint', hint: next })
    setNotice(null)
    announce(describeHint(next, clues))
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
      announce(`New ${LEVELS[next.levelId].name} puzzle, ${LEVELS[next.levelId].cols} by ${LEVELS[next.levelId].rows}.`)
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.sl-cells'))) {
      // Arrow keys anywhere else jump into the grid, ready to move around it.
      document.querySelector<HTMLElement>('.sl-cells [tabindex="0"]')?.focus()
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved. The loop is closed.' }
      return {
        tone: 'success',
        text: mistakes === 0 ? 'Loop closed, without a single mistake!' : `Loop closed, with ${plural(mistakes, 'mistake')}.`,
      }
    }
    if (solverActive) return { tone: 'info', text: solverMode === 'paused' ? 'Auto-solve paused.' : 'Auto-solving…' }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint, clues) }
    if (status === 'ready') return { tone: 'info', text: 'Draw one loop along the dots. Each number counts the loop’s sides around it.' }
    return { tone: 'info', text: `${plural(lines, 'line')} drawn. Tap to draw, again to cross out.` }
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
        progress={{ label: 'Mistakes', value: String(mistakes), note: `${plural(lines, 'line')} drawn` }}
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
        <SlitherlinkBoard
          rows={rows}
          cols={cols}
          clues={clues}
          edges={edges}
          problems={problems}
          hint={boardHint}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
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
        canRestart={history.length > 0 || mistakes > 0}
        canHint={!locked}
        canSolve={!won}
        solverActive={solverActive}
        hintTitle="Show the next step, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        Tap an edge to draw · drag along the dots · right-click cross · <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move ·{' '}
        <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> draw (<kbd>⇧</kbd> cross) · <kbd>Z</kbd> undo · <kbd>H</kbd> hint
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Flawless!"
          perfectNote="The whole loop drawn without breaking a single rule."
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
