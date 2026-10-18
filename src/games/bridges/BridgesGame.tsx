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
import { BridgesBoard } from './BridgesBoard'
import { bridgesAt, findHint, LEVEL_IDS, LEVELS, type Hint, type LevelId } from './bridges'
import { blockersOf, cycled, layoutOfState, type BridgesAction } from './gameState'
import { useBridgesGame } from './useBridgesGame'

/** Starting over after at least this many moves asks for confirmation first. */
const CONFIRM_AFTER_MOVES = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

const bridgeWords = (count: number) => (count === 2 ? 'two bridges' : 'a bridge')

/** Explains a hint in words; the board marks the island it is about and the link. */
function describeHint(hint: Hint, islandCount: number | null): string {
  if (hint.kind === 'wrong') return 'Hint: the marked bridge has no place in the solution. Take it away.'
  const number = islandCount === null ? 'island' : String(islandCount)
  let text: string
  if (hint.reason === 'needs-all') {
    text = `Hint: the marked ${number} needs every bridge it can still get, so this link takes ${bridgeWords(hint.count)}.`
  } else if (hint.reason === 'at-least') {
    text = `Hint: the marked ${number} can't reach its number without ${bridgeWords(hint.count)} on this link.`
  } else {
    text = `Hint: with fewer bridges on this link, the islands around it would run out of options. It needs ${bridgeWords(hint.count)}.`
  }
  if (hint.before.includes('lookahead')) return `${text} Seeing it takes some looking ahead.`
  if (hint.before.includes('isolation')) return `${text} First rule out bridges that would cut islands off from the rest.`
  return text
}

export function BridgesGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useBridgesGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, islands, solution, counts, history, future, hint, status } = state
  const layout = layoutOfState(state)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [blocked, setBlocked] = useState<{ links: number[]; id: number } | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const solverActive = solverMode !== 'off' && !won
  const locked = solverActive || won
  const minimum = solution.reduce((sum, count) => sum + count, 0)
  const islandsLeft = islands.filter((island, index) => bridgesAt(layout, counts, index) !== island.count).length

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action with its sound, and takes note of a win. */
  const play = (action: BridgesAction) => {
    const { next, result } = act(action)
    if (next === state) return
    if (next.lastMove && next.lastMove.id !== state.lastMove?.id) {
      const link = next.lastMove.link
      const grew = next.counts[link] > state.counts[link]
      if (grew) sound.digit(next.counts[link] === 2 ? 7 : 5, false)
      else sound.lift()
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : 'Every island connected!')
    }
  }

  const cycle = (link: number, ambiguous = false) => {
    if (locked) return
    if (cycled(state, link) > 0) {
      const blockers = blockersOf(state, link)
      if (blockers.length) {
        sound.error()
        setBlocked({ links: blockers, id: Date.now() })
        const text = "Bridges can't cross each other."
        setNotice({ tone: 'error', text })
        announce(text)
        return
      }
    }
    play({ type: 'cycle', link })
    setNotice(
      ambiguous
        ? { tone: 'info', text: 'Two gaps cross here. For the other one, tap away from the crossing or drag from an island.' }
        : null,
    )
    const { a, b } = layout.links[link]
    const after = cycled(state, link)
    announce(`${after === 0 ? 'No bridges' : after === 1 ? 'One bridge' : 'Two bridges'} between the ${islands[a].count} and the ${islands[b].count}.`)
  }

  const undo = () => {
    if (locked || history.length === 0) return
    play({ type: 'undo' })
    setNotice(null)
    announce('Undone.')
  }

  const redo = () => {
    if (locked || future.length === 0) return
    play({ type: 'redo' })
    setNotice(null)
    announce('Redone.')
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !won && dialog === null && !paused,
    position: counts,
    step: () => {
      const next = findHint(layout, solution, counts)
      if (!next) {
        setSolverMode('off')
        return
      }
      play({ type: 'set', link: next.link, count: next.kind === 'wrong' ? solution[next.link] : next.count, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const next = findHint(layout, solution, counts)
    if (!next) return
    play({ type: 'hint', hint: next })
    setNotice(null)
    announce(describeHint(next, next.kind === 'bridge' && next.island !== undefined ? islands[next.island].count : null))
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    setBlocked(null)
    if (next.kind === 'restart') {
      restart()
      announce('Puzzle restarted.')
    } else {
      newGame(next.levelId)
      announce(`New ${LEVELS[next.levelId].name} puzzle with ${LEVELS[next.levelId].islands} islands.`)
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

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.bridges-board'))) {
      // Arrow keys anywhere else jump onto the islands, ready to move around them.
      document.querySelector<SVGGElement>('.bridges-board [tabindex="0"]')?.focus()
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
      if (state.solverUsed) return { tone: 'success', text: 'Auto-solved. Every island connected.' }
      return {
        tone: 'success',
        text: history.length <= minimum ? 'Every island connected, without a wasted move!' : 'Every island connected!',
      }
    }
    if (solverActive) {
      const left = minimum - counts.reduce((sum, count) => sum + count, 0)
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(Math.max(0, left), 'bridge')} to go.`,
      }
    }
    if (notice) return notice
    if (hint) return { tone: 'hint', text: describeHint(hint, hint.kind === 'bridge' && hint.island !== undefined ? islands[hint.island].count : null) }
    if (status === 'ready') {
      return { tone: 'info', text: 'Each island needs as many bridges as its number, and all must join up. Tap between two islands to build.' }
    }
    return { tone: 'info', text: `${plural(islandsLeft, 'island')} still ${islandsLeft === 1 ? 'needs' : 'need'} bridges.` }
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
        <BridgesBoard
          layout={layout}
          counts={counts}
          hint={hint}
          blocked={blocked}
          lastMove={state.lastMove}
          gameId={state.gameId}
          won={won}
          locked={locked}
          onCycle={cycle}
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
        hintTitle="Show a bridge you can be sure of, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        Tap between islands to build · <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Shift</kbd>+arrow build ·{' '}
        <kbd>Z</kbd> undo · <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Perfect build!"
          perfectNote="Every bridge went up right the first time, without a wasted move."
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
