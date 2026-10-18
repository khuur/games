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
import type { StarBattleAction } from './gameState'
import { StarBattleBoard } from './StarBattleBoard'
import {
  BLANK,
  CROSS,
  findHint,
  LEVEL_IDS,
  LEVELS,
  ruledOutBy,
  STAR,
  STARS,
  unitKind,
  unitsOf,
  type Hint,
  type LevelId,
  type Mark,
} from './starBattle'
import { useStarBattleGame } from './useStarBattleGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

/** How hints name the regions, matching their colours on the board. */
const REGION_NAMES = ['coral', 'peach', 'yellow', 'lime', 'mint', 'aqua', 'blue', 'lilac', 'pink', 'stone']

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** Units of one kind as words: "row 3", "columns 2 and 5" or "the pink and blue regions". */
function unitsName(units: number[], size: number): string {
  const kind = unitKind(units[0], size)
  if (kind === 'region') {
    const names = listOf(units.map((unit) => REGION_NAMES[unit - 2 * size]))
    return `the ${names} region${units.length > 1 ? 's' : ''}`
  }
  const numbers = listOf(units.map((unit) => String(kind === 'row' ? unit + 1 : unit - size + 1)))
  return `${kind}${units.length > 1 ? 's' : ''} ${numbers}`
}

/** Explains a hint in words; the board stripes the area it is about and marks the cells. */
function describeHint(hint: Hint, size: number): string {
  if (hint.kind === 'wrong-cross') {
    const many = hint.cells.length > 1
    return `Hint: ${many ? 'these crosses are on cells where stars belong' : 'this cross is on a cell where a star belongs'}. Clear ${many ? 'them' : 'it'}.`
  }
  const { technique, units, finding } = hint.step
  if (!units.length) return 'Hint: a star goes on the marked cell.'
  const name = unitsName(units.slice(0, 1), size)
  switch (technique) {
    case 'only-spots':
      return `Hint: ${name} has just as many cells left as stars it still needs, so the marked cell holds one.`
    case 'unit':
      if (finding === 'always') return `Hint: every way to fit the stars ${name} still needs, none touching, uses the marked cell, so it holds a star.`
      if (finding === 'never') return `Hint: no way to fit the stars ${name} still needs, none touching, uses the marked cells, so they're out.`
      return `Hint: every way to fit the stars ${name} still needs puts one right next to the marked cells, so they can't hold a star.`
    case 'lookahead':
      return `Hint: a star on the marked cell would leave ${name} without room for its stars, so it can't go there.`
    case 'confined': {
      const count = units.length / 2
      const inner = unitsName(units.slice(0, count), size)
      const outer = unitsName(units.slice(count), size)
      return `Hint: ${inner} ${count === 1 ? 'fits' : 'fit'} only in ${outer}, so ${count === 1 ? 'it supplies' : 'they supply'} all the stars ${outer} still ${count === 1 ? 'needs' : 'need'}. Nothing else there can hold one.`
    }
  }
}

export function StarBattleGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useStarBattleGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, regions, solution, marks, wrong, history, future, mistakes, hint, status } = state
  const { size } = LEVELS[levelId]
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const starsLeft = STARS * size - marks.filter((mark) => mark === STAR).length
  const ruledOut = useMemo(
    () => ruledOutBy(marks.flatMap((mark, cell) => (mark === STAR ? [cell] : [])), size, regions),
    [marks, size, regions],
  )
  const hintArea = useMemo(() => {
    if (hint?.kind !== 'step') return new Set<number>()
    const units = unitsOf(size, regions)
    const { technique, units: about } = hint.step
    const shown = technique === 'confined' ? about.slice(0, about.length / 2) : about
    return new Set(shown.flatMap((unit) => units[unit]))
  }, [hint, size, regions])

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action, and takes note of a mistake or a win. Returns false after a mistake. */
  const play = (action: StarBattleAction) => {
    const { previous, next, result } = act(action)
    if (next === previous) return true
    const madeMistake = next.mistakes > previous.mistakes
    if (madeMistake) {
      sound.error()
      const text = 'No star belongs there. It gets a red cross.'
      setNotice({ tone: 'error', text })
      announce(text)
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'All stars placed!')
    }
    return !madeMistake
  }

  const mark = (cells: number[], from: Mark, to: Mark, stroke: number) => {
    if (locked) return false
    const keepGoing = play({ type: 'mark', cells, from, to, stroke })
    if (keepGoing) {
      if (to === STAR) sound.digit(9, false)
      else sound.digit(to === CROSS ? 3 : 2, true)
      setNotice(null)
      if (to === STAR && cells.length === 1) {
        announce(`Star placed in row ${Math.floor(cells[0] / size) + 1}, column ${(cells[0] % size) + 1}.`)
      }
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

  /** The changes a hint stands for. */
  const changesFor = (next: Hint): { cell: number; to: Mark }[] => {
    if (next.kind === 'wrong-cross') return next.cells.map((cell) => ({ cell, to: BLANK }))
    return [
      ...(next.step.star === undefined ? [] : [{ cell: next.step.star, to: STAR as Mark }]),
      ...(next.step.eliminate ?? []).map((cell) => ({ cell, to: CROSS as Mark })),
    ]
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: marks,
    step: () => {
      const next = findHint(size, regions, solution, marks)
      if (!next) {
        setSolverMode('off')
        return
      }
      const changes = changesFor(next)
      if (changes.some(({ to }) => to === STAR)) sound.digit(9, false)
      else sound.digit(3, true)
      play({ type: 'apply', changes, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(size, regions, solution, marks)
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.sb-board'))) {
      // Arrow keys anywhere else jump into the board, ready to move around it.
      document.querySelector<HTMLElement>('.sb-board [tabindex="0"]')?.focus()
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved. Every star in place.' }
      return {
        tone: 'success',
        text: mistakes === 0 ? 'All stars placed, without a single mistake!' : `All stars placed, with ${plural(mistakes, 'mistake')}.`,
      }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(starsLeft, 'star')} to go.`,
      }
    }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint, size) }
    if (status === 'ready') {
      return { tone: 'info', text: 'Two stars in every row, column and region, and no two touching, not even at a corner.' }
    }
    return { tone: 'info', text: `${plural(starsLeft, 'star')} to place.` }
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
        progress={{ label: 'Mistakes', value: String(mistakes), note: `${plural(starsLeft, 'star')} to go` }}
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
        <StarBattleBoard
          size={size}
          regions={regions}
          marks={marks}
          wrong={wrong}
          ruledOut={ruledOut}
          hint={hint}
          hintArea={hintArea}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
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
        hintTitle="Show the next step, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> cross / star · <kbd>S</kbd> star ·{' '}
        <kbd>X</kbd> cross · right-click star · <kbd>Z</kbd> undo · <kbd>H</kbd> hint
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Flawless!"
          perfectNote="Every star placed without a single wrong one."
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
