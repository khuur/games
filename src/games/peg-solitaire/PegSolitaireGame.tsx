import { ArrowRightLeft, RotateCcw } from 'lucide-react'
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
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import type { GameProps } from '..'
import type { PegAction } from './gameState'
import { PegBoard } from './PegBoard'
import {
  adviseGradually,
  BOARD_IDS,
  BOARDS,
  countPegs,
  isLegal,
  legalJumps,
  Outcome,
  solve,
  type BoardId,
  type Jump,
} from './pegSolitaire'
import { usePegGame } from './usePegGame'

/** Starting over after at least this many jumps asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10
const JUMP_DURATION = 380

const BOARD_OPTIONS = BOARD_IDS.map((id) => ({ value: id, label: BOARDS[id].name }))

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; boardId: BoardId } | null

interface Notice {
  tone: StatusTone
  text: string
}

export function PegSolitaireGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame } = usePegGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { boardId, pegs, selected, hint, history, future, status } = state
  const board = BOARDS[boardId]
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [rejected, setRejected] = useState<{ hole: number; id: number } | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [hintFinish, setHintFinish] = useState<Outcome | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [thinking, setThinking] = useState<{ kind: 'hint' | 'solve'; key: string } | null>(null)
  const plan = useRef<Jump[]>([])

  // Searches run in the background; this tells them when the position they were asked about is gone.
  const positionKey = `${boardId}:${pegs.map(Number).join('')}`
  const latestKey = useRef(positionKey)
  useEffect(() => {
    latestKey.current = positionKey
  })

  const won = status === 'won'
  const pegsLeft = countPegs(pegs)
  const solverActive = solverMode !== 'off' && !won
  const isThinking = thinking?.key === positionKey
  const locked = solverActive || won
  const goalName = boardId === 'english' ? 'centre' : 'top hole'
  const targets = selected === null ? [] : legalJumps(board, pegs, selected).map((jump) => jump.to)

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const describe = (hole: number) => {
    const { row, column } = board.holes[hole]
    return boardId === 'triangle' ? `row ${row + 1}, hole ${column + 1}` : `row ${row + 1}, column ${column + 1}`
  }

  /** Plays a jump-like action and takes note when it wins the game. */
  const play = (action: PegAction) => {
    const result = act(action)
    if (!result) return
    setWinResult(result)
    announce(result.perfect ? `Perfect! One peg left, in the ${goalName}.` : 'One peg left!')
  }

  const jumpWithSound = (jump: Jump, bySolver = false) => {
    const total = board.holes.length - 1
    sound.jump((total - (pegsLeft - 1)) / (total - 1))
    setNotice(null)
    setHintFinish(null)
    if (!bySolver) announce(`Jumped from ${describe(jump.from)} to ${describe(jump.to)}.`)
    play({ type: 'jump', jump, bySolver })
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: pegs,
    step: () => {
      const jump = plan.current[0]
      if (!jump || !isLegal(board, pegs, jump)) {
        setSolverMode('off')
        return
      }
      plan.current = plan.current.slice(1)
      jumpWithSound(jump, true)
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const reject = (hole: number, text: string) => {
    sound.error()
    setRejected({ hole, id: Date.now() })
    setNotice({ tone: 'error', text })
    announce(text)
  }

  const activateHole = (hole: number) => {
    if (locked) return
    if (pegs[hole]) {
      if (selected === hole) {
        sound.lift()
        act({ type: 'deselect' })
        announce('Put back.')
        return
      }
      if (legalJumps(board, pegs, hole).length === 0) {
        reject(hole, 'That peg has nowhere to jump.')
        return
      }
      sound.lift()
      act({ type: 'select', hole })
      setNotice(null)
      announce(`Peg at ${describe(hole)} picked up.`)
      return
    }
    // An empty hole: finish the selected peg's jump, or take the only jump that lands here.
    const candidates = legalJumps(board, pegs).filter(
      (jump) => jump.to === hole && (selected === null || jump.from === selected),
    )
    if (candidates.length === 1) jumpWithSound(candidates[0])
    else if (candidates.length > 1) {
      setNotice({ tone: 'info', text: 'More than one peg can jump there. Pick the one you mean first.' })
    } else reject(hole, selected === null ? 'No peg can jump there.' : "The peg you picked can't jump there.")
  }

  const undo = () => {
    if (locked || history.length === 0) return
    sound.lift()
    setNotice(null)
    setHintFinish(null)
    play({ type: 'undo' })
    announce('Jump undone.')
  }

  const redo = () => {
    const next = future.at(-1)
    if (locked || !next) return
    jumpWithSound(next)
    announce('Jump redone.')
  }

  /** Works out the best way on without freezing the page; gives up quietly if the position changes. */
  const think = async (kind: 'hint' | 'solve') => {
    const key = positionKey
    setThinking({ kind, key })
    const result = await adviseGradually(board, pegs, () => latestKey.current !== key)
    if (result === 'cancelled') return result
    setThinking(null)
    if (!result) {
      setNotice({ tone: 'error', text: 'This position is too tangled to work out. Try undoing a few jumps.' })
      announce('This position is too tangled to work out. Try undoing a few jumps.')
    } else if (!result.jump) {
      const text =
        boardId === 'english'
          ? 'There is no way to finish in the centre from here. Undo a few jumps to get back on track.'
          : 'There is no way to get down to one peg from here. Undo a few jumps to get back on track.'
      setNotice({ tone: 'error', text })
      announce(text)
    }
    return result
  }

  const showHint = async () => {
    if (locked || isThinking) return
    const result = await think('hint')
    if (result === 'cancelled' || !result?.jump) return
    act({ type: 'hint', jump: result.jump })
    setHintFinish(result.outcome)
    setNotice(null)
    announce(`Hint: jump from ${describe(result.jump.from)} to ${describe(result.jump.to)}.`)
  }

  const begin = (next: BoardId) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    setRejected(null)
    setHintFinish(null)
    plan.current = []
    newGame(next)
    announce(`New game on ${BOARDS[next].phrase}.`)
  }

  const requestStart = (next: BoardId) => {
    if (status === 'playing' && history.length >= CONFIRM_AFTER_MOVES) setDialog({ kind: 'confirm', boardId: next })
    else begin(next)
  }

  const toggleSolver = async () => {
    if (solverActive) {
      setSolverMode('off')
      announce('Auto-solve stopped.')
      return
    }
    if (won || isThinking) return
    const result = await think('solve')
    if (result === 'cancelled' || !result?.jump) return
    // The search just proved the way forward, so laying out the full route is quick.
    plan.current = solve(board, pegs) ?? []
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.peg-board'))) {
      document.querySelector<HTMLElement>('.peg-board .hole[tabindex="0"]')?.focus()
    } else if (key === 'escape' && selected !== null) {
      act({ type: 'deselect' })
    } else if (key === 'z') {
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      redo()
    } else if (key === 'h' && !event.repeat) {
      void showHint()
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
      const perfect = pegs[board.goalHole]
      if (state.solverUsed) return { tone: 'success', text: `Auto-solved with ${plural(history.length, 'jump')}.` }
      return { tone: 'success', text: perfect ? `One peg left, right in the ${goalName}. Perfect!` : 'One peg left!' }
    }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(pegsLeft - 1, 'jump')} to go.`,
      }
    }
    if (isThinking) return { tone: 'info', text: 'Thinking…' }
    if (notice) return notice
    if (status === 'stuck') {
      return { tone: 'error', text: `No jumps left, with ${pegsLeft} pegs on the board. Undo, or start again.` }
    }
    if (hint) {
      const lesser = hintFinish === Outcome.OnePeg ? ` The ${goalName} is out of reach now, but one peg isn't.` : ''
      return { tone: 'hint', text: `Hint: jump the glowing peg into the marked hole.${lesser}` }
    }
    if (selected !== null) return { tone: 'info', text: 'Pick a hole to jump into.' }
    if (status === 'ready') {
      return { tone: 'info', text: `Jump pegs over each other until one is left, ideally in the ${goalName}.` }
    }
    return { tone: 'info', text: `${plural(pegsLeft, 'peg')} left.` }
  })()

  const otherBoard: BoardId = boardId === 'english' ? 'triangle' : 'english'
  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [{ label: 'Try it yourself', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin(boardId) }]
    }
    return [
      {
        label: `Try ${BOARDS[otherBoard].phrase}`,
        icon: <ArrowRightLeft aria-hidden="true" />,
        onClick: () => begin(otherBoard),
      },
      { label: 'Play again', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin(boardId) },
    ]
  }

  const record = records[boardId]
  const jumpDuration = solverActive ? Math.min(JUMP_DURATION, solver.speed.interval * 0.8) : JUMP_DURATION

  return (
    <>
      <StatsBar
        progress={{ label: 'Pegs left', value: String(pegsLeft), note: plural(history.length, 'jump') }}
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
        <PegBoard
          board={board}
          pegs={pegs}
          gameId={state.gameId}
          selected={selected}
          targets={targets}
          hint={hint}
          lastJump={state.lastJump}
          rejected={rejected}
          locked={locked}
          won={won}
          reducedMotion={reducedMotion}
          jumpDuration={jumpDuration}
          onHoleActivate={activateHole}
        />
      </div>

      <GameControls
        level={<ChoiceGroup label="Board" options={BOARD_OPTIONS} value={boardId} onChange={requestStart} />}
        canUndo={!locked && history.length > 0}
        canRedo={!locked && future.length > 0}
        canRestart={history.length > 0}
        canHint={!locked && !isThinking}
        canSolve={!won && !isThinking}
        solverActive={solverActive}
        hintTitle="Show a good jump"
        onUndo={undo}
        onRedo={redo}
        onRestart={() => requestStart(boardId)}
        onHint={() => void showHint()}
        onToggleSolver={() => void toggleSolver()}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> pick up / jump · <kbd>Z</kbd> undo ·{' '}
        <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Perfect finish!"
          perfectNote={`The last peg ended in the ${goalName}, just as the classic puzzle asks.`}
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title="Start a new game?"
          message={`You'll lose your current game (${plural(history.length, 'jump')} so far).`}
          confirmLabel="New game"
          onConfirm={() => begin(dialog.boardId)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
