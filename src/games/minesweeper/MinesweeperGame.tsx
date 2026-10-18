import { ChevronRight, Flag, RotateCcw, Shuffle, Undo2 } from 'lucide-react'
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
import { useStoredState } from '../../hooks/useStoredState'
import { plural } from '../../lib/format'
import type { WinResult } from '../../lib/scoring'
import { sound } from '../../lib/sound'
import { isBoolean } from '../../lib/storage'
import type { GameProps } from '..'
import { chordCells, countFlags, type MinesAction } from './gameState'
import { MineBoard } from './MineBoard'
import { findHint, generateMines, LEVEL_IDS, LEVELS, neighbours, type Hint, type LevelId } from './minesweeper'
import { FLAG_MODE_KEY } from './persistence'
import { useMinesweeperGame } from './useMinesweeperGame'

/** Starting over after at least this many clicks asks for confirmation first. */
const CONFIRM_AFTER_CLICKS = 10

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type PendingStart = { kind: 'restart' } | { kind: 'new'; levelId: LevelId }

type OpenDialog = { kind: 'win'; result: WinResult } | { kind: 'confirm'; next: PendingStart } | null

interface Notice {
  tone: StatusTone
  text: string
}

/** Explains a hint in words; the board marks the numbers it refers to. */
function describeHint(hint: Hint, counts: readonly number[]): string {
  const one = hint.cells.length === 1
  if (hint.kind === 'wrong-flag') {
    return `Hint: ${one ? 'this flag is' : 'these flags are'} wrong. The numbers show ${one ? 'that cell is' : 'those cells are'} safe.`
  }
  const verdict =
    hint.kind === 'safe'
      ? `the pulsing ${one ? 'cell is' : 'cells are'} safe`
      : `the pulsing ${one ? 'cell is a mine' : 'cells are all mines'}`
  const number = counts[hint.clues[0]]
  if (hint.rule === 'single') {
    return hint.kind === 'safe'
      ? `Hint: the marked ${number} already has all its mines accounted for, so ${verdict}.`
      : `Hint: the marked ${number} has just enough hidden cells left for its mines, so ${verdict}.`
  }
  if (hint.rule === 'pair') return `Hint: compare the two marked numbers. Together they prove ${verdict}.`
  if (!hint.clues.length) return `Hint: count the mines still to find. That settles it: ${verdict}.`
  return `Hint: work through the marked numbers together, counting the mines still to find. That settles it: ${verdict}.`
}

export function MinesweeperGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame, restart } = useMinesweeperGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, revealed, flags, counts, mines, status, hint, clicks, par } = state
  const level = LEVELS[levelId]
  const [flagMode, setFlagMode] = useStoredState(FLAG_MODE_KEY, false, isBoolean)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const won = status === 'won'
  const lost = status === 'lost'
  const over = won || lost
  const started = mines !== null
  const solverActive = solverMode !== 'off' && !over
  const locked = solverActive || over
  const flagCount = countFlags(state)
  const safeLeft = revealed.filter((open, cell) => !open && !mines?.[cell]).length - (started ? 0 : level.mines)

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action with its sound, and takes note of a win or a loss. */
  const play = (action: MinesAction) => {
    const { next, result } = act(action)
    if (next === state) return
    const opened = next.revealed.filter(Boolean).length - revealed.filter(Boolean).length
    if (next.status === 'lost' && !lost) {
      sound.boom()
      announce('Boom! That was a mine. Press Z to take it back.')
    } else if (opened > 0) {
      sound.open(opened)
    }
    if (result) {
      setWinResult(result)
      announce(result.assistedBy === 'solver' ? 'Auto-solved.' : `Board cleared in ${plural(result.moves, 'click')}!`)
    }
  }

  const startAt = (cell: number, bySolver = false) => {
    play({ type: 'start', cell, mines: generateMines(level, cell), bySolver })
  }

  /** A tap on a number: opens around it if its mines are all flagged, or says what is missing. */
  const chord = (cell: number) => {
    if (!counts || counts[cell] === 0) return
    if (chordCells(state, cell)) {
      play({ type: 'open', cell })
      return
    }
    const around = neighbours(level)[cell]
    if (!around.some((next) => !revealed[next] && !flags[next])) return
    const count = counts[cell]
    const flagged = around.filter((next) => flags[next]).length
    let text = `There are more flags than mines around this ${count}.`
    if (flagged < count) {
      text =
        count === 1
          ? 'Flag the mine next to this 1 first, then tap it to open the rest.'
          : `Flag the ${count} mines next to this ${count} first, then tap it to open the rest.`
    }
    setNotice({ tone: 'info', text })
    announce(text)
  }

  const open = (cell: number) => {
    if (locked) return
    setNotice(null)
    if (!started) startAt(cell)
    else if (revealed[cell]) chord(cell)
    else if (flags[cell]) setNotice({ tone: 'info', text: 'That cell has a flag. Take the flag off to open it.' })
    else play({ type: 'open', cell })
  }

  const flag = (cell: number) => {
    if (locked) return
    if (!started) {
      setNotice({ tone: 'info', text: 'Open a cell first. The first one is always safe.' })
      return
    }
    if (revealed[cell]) {
      chord(cell)
      return
    }
    sound.flag(!flags[cell])
    setNotice(null)
    play({ type: 'flag', cell })
    announce(flags[cell] ? 'Flag removed.' : 'Flag planted.')
  }

  const takeBack = () => {
    if (!lost) return
    sound.lift()
    play({ type: 'take-back' })
    announce('Mine taken back. Carry on.')
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !over && dialog === null && !paused,
    position: state,
    step: () => {
      if (!started || !counts) {
        startAt(Math.floor(level.rows / 2) * level.columns + Math.floor(level.columns / 2), true)
        return
      }
      const move = findHint(level, counts, revealed, flags)
      if (move?.kind === 'safe') {
        play({ type: 'open-many', cells: move.cells, bySolver: true })
      } else if (move) {
        sound.flag(move.kind === 'mine')
        play({ type: 'set-flags', cells: move.cells, flagged: move.kind === 'mine', bySolver: true })
      } else {
        // Logic has run dry, which these boards shouldn't allow; open a safe cell so the solver can finish.
        const cell = revealed.findIndex((shown, index) => !shown && !mines?.[index])
        if (cell >= 0) play({ type: 'open-many', cells: [cell], bySolver: true })
        else setSolverMode('off')
      }
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    if (!started || !counts) {
      setNotice({ tone: 'hint', text: 'Tap any cell to begin. The first one is always safe and opens up an area.' })
      return
    }
    const next = findHint(level, counts, revealed, flags)
    if (!next) {
      setNotice({ tone: 'info', text: 'Nothing more can be worked out from here.' })
      return
    }
    play({ type: 'hint', hint: next })
    setNotice(null)
    announce(describeHint(next, counts))
  }

  const begin = (next: PendingStart) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    if (next.kind === 'restart') {
      restart()
      announce('The same board again, from its opening.')
    } else {
      newGame(next.levelId)
      announce(`New ${LEVELS[next.levelId].name} board. Tap any cell to start.`)
    }
  }

  const requestStart = (next: PendingStart) => {
    if (status === 'playing' && clicks >= CONFIRM_AFTER_CLICKS) setDialog({ kind: 'confirm', next })
    else begin(next)
  }

  const toggleSolver = () => {
    if (solverActive) {
      setSolverMode('off')
      announce('Auto-solve stopped.')
      return
    }
    if (over) return
    play({ type: 'solver-started' })
    setSolverMode('running')
    setNotice(null)
    announce('Auto-solving.')
  }

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || dialog || paused) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target
    if (target instanceof Element && target.closest('input, select, textarea, [contenteditable="true"]')) return
    const key = event.key.toLowerCase()

    if (key.startsWith('arrow') && !(target instanceof Element && target.closest('.mine-board'))) {
      // Arrow keys anywhere else jump into the minefield, ready to move around it.
      document.querySelector<HTMLElement>('.mine-board [tabindex="0"]')?.focus()
    } else if (key === 'h' && !event.repeat) {
      showHint()
    } else if (key === 'z' && lost) {
      takeBack()
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
      return { tone: 'success', text: state.solverUsed ? 'Auto-solved. Every mine found.' : `Board cleared in ${plural(clicks, 'click')}!` }
    }
    if (lost) return { tone: 'error', text: 'Boom! That was a mine.' }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(safeLeft, 'safe cell')} to go.`,
      }
    }
    if (notice) return notice
    if (hint && counts) return { tone: 'hint', text: describeHint(hint, counts) }
    if (!started) {
      return { tone: 'info', text: 'Tap any cell to start. The first is always safe, and no board ever needs a guess.' }
    }
    if (status === 'ready') return { tone: 'info', text: 'The same board, from the same opening. Off you go!' }
    return { tone: 'info', text: `${plural(safeLeft, 'safe cell')} left to open.` }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [
        { label: 'Try it yourself', icon: <RotateCcw aria-hidden="true" />, primary: true, onClick: () => begin({ kind: 'restart' }) },
      ]
    }
    const another: WinAction = {
      label: 'New board',
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
        progress={{
          label: 'Mines left',
          value: String(level.mines - flagCount),
          note: started ? `${clicks}/${par} clicks` : 'Tap anywhere',
        }}
        elapsedMs={elapsedMs}
        status={status}
        timerPaused={solverActive || dialog !== null || paused}
        bestTimeMs={record?.timeMs}
        bestNote={record ? `${record.solved} cleared` : ''}
      />

      <StatusBar
        tone={message.tone}
        actions={
          solverActive ? (
            <SolverControls
              paused={solverMode === 'paused'}
              speedIndex={solver.speedIndex}
              onTogglePause={() => setSolverMode((mode) => (mode === 'running' ? 'paused' : 'running'))}
              onSpeedChange={solver.setSpeedIndex}
            />
          ) : (
            lost && (
              <button type="button" className="button button-primary" onClick={takeBack} title="Take back that click (Z)">
                <Undo2 aria-hidden="true" />
                Take back
              </button>
            )
          )
        }
      >
        {message.text}
      </StatusBar>

      <div className="board-card">
        <MineBoard
          level={level}
          revealed={revealed}
          flags={flags}
          counts={counts}
          mines={mines}
          status={status}
          exploded={state.exploded}
          hint={hint}
          lastOpen={state.lastOpen}
          gameId={state.gameId}
          locked={locked}
          flagMode={flagMode}
          onOpen={open}
          onFlag={flag}
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
        extra={
          <button
            type="button"
            className={`button${flagMode ? ' is-active' : ''}`}
            aria-pressed={flagMode}
            onClick={() => setFlagMode(!flagMode)}
            title={flagMode ? 'Taps plant flags; a long press opens' : 'Taps open cells; a long press plants a flag'}
          >
            <Flag aria-hidden="true" />
            <span className="button-label">Flag</span>
          </button>
        }
        canRestart={started && status !== 'ready'}
        restartLabel="Replay"
        canHint={!locked}
        canSolve={!over}
        solverActive={solverActive}
        hintTitle="Show a safe move, and why"
        onRestart={() => requestStart({ kind: 'restart' })}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>F</kbd> flag · right-click
        flags · <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Cleared within par!"
          solvedTitle="Board cleared!"
          perfectNote="Par is the clicks this board takes without flags or chords, and you matched it."
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.next.kind === 'restart' ? 'Replay this board?' : 'Start a new board?'}
          message={`You'll lose your progress (${plural(clicks, 'click')} so far).`}
          confirmLabel={dialog.next.kind === 'restart' ? 'Replay' : 'New board'}
          onConfirm={() => begin(dialog.next)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
