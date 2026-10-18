import { ChevronRight, Flag, Shuffle } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
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
import { CodeBoard } from './CodeBoard'
import { bestGuess, LEVEL_IDS, LEVELS, possibleCodes, worstCase, type LevelId } from './codeBreaker'
import { canPlace, isOver, type CodeBreakerAction } from './gameState'
import { colorName, describeCode, describeFeedback } from './pegs'
import { parPromise, useCodeBreakerGame } from './useCodeBreakerGame'

/** Starting over after at least this many guesses asks for confirmation first. */
const CONFIRM_AFTER_GUESSES = 3

const LEVEL_OPTIONS = LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name }))

type OpenDialog =
  | { kind: 'win'; result: WinResult }
  | { kind: 'confirm-new'; levelId: LevelId }
  | { kind: 'confirm-give-up' }
  | null

interface Notice {
  tone: StatusTone
  text: string
}

const guessCount = (count: number) => plural(count, 'guess', 'guesses')
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function CodeBreakerGame({ paused }: GameProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [solverMode, setSolverMode] = useState<SolverMode>('off')
  const { state, act, elapsedMs, records, newGame } = useCodeBreakerGame({
    timerPaused: solverMode !== 'off' || dialog !== null || paused,
  })
  const { levelId, guesses, row, cursor, secret, hinted, status } = state
  const level = LEVELS[levelId]
  const [notice, setNotice] = useState<Notice | null>(null)
  const [hintInfo, setHintInfo] = useState<{ fitting: number; worst: number } | null>(null)
  const [winResult, setWinResult] = useState<WinResult | null>(null)
  const [announcement, setAnnouncement] = useState('')
  /** The guess the auto-solver is putting together, and which guess it is for. */
  const plan = useRef<{ turn: number; code: number[] } | null>(null)

  const won = status === 'won'
  const over = isOver(state)
  const gaveUp = status === 'lost' && guesses.length < level.guesses
  const solverActive = solverMode !== 'off' && !over
  const locked = solverActive || over
  const fitting = useMemo(() => possibleCodes(level, guesses).length, [level, guesses])
  const complete = row.every((color) => color !== null)
  const guessesLeft = level.guesses - guesses.length

  /** Screen readers only re-read a live region when its text changes. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice])

  /** Plays an action, with what follows a checked guess: the marks, and a win or a loss. */
  const play = (action: CodeBreakerAction) => {
    const { next, result } = act(action)
    if (next === state || action.type !== 'submit') return
    const latest = next.guesses.at(-1)
    if (latest) sound.marks(latest.feedback.exact, latest.feedback.near)
    if (result) {
      setWinResult(result)
      announce(`${result.assistedBy === 'solver' ? 'Auto-solved' : 'Cracked it'} in ${guessCount(result.moves)}!`)
    } else if (next.status === 'lost') {
      setTimeout(() => sound.lose(), 450)
      announce(`Out of guesses. The code was ${describeCode(secret)}.`)
    } else if (latest && !action.bySolver) {
      announce(`${describeFeedback(latest.feedback)}. ${guessCount(level.guesses - next.guesses.length)} left.`)
    }
  }

  const placeColor = (color: number) => {
    if (locked || color >= level.colors) return
    if (!canPlace(state, color)) {
      sound.error()
      const text = `Each colour can appear only once on ${level.name}.`
      setNotice({ tone: 'error', text })
      announce(text)
      return
    }
    sound.peg(color)
    setNotice(null)
    play({ type: 'place', color })
    announce(`${capitalized(colorName(color))} in slot ${cursor + 1}.`)
  }

  const clearSlot = (slot: number) => {
    if (locked) return
    sound.lift()
    play({ type: 'clear', slot })
  }

  const selectSlot = (slot: number) => {
    if (!locked) play({ type: 'select', slot })
  }

  const erase = () => {
    if (locked || row.every((color) => color === null)) return
    sound.lift()
    play({ type: 'erase' })
  }

  const submit = (bySolver = false) => {
    if (locked && !bySolver) return
    if (!complete) {
      if (bySolver) return
      sound.error()
      const text = 'Fill every slot before checking.'
      setNotice({ tone: 'error', text })
      announce(text)
      return
    }
    setNotice(null)
    play({ type: 'submit', bySolver })
  }

  const solver = useAutoSolver({
    running: solverMode === 'running' && !over && dialog === null && !paused,
    position: state,
    step: () => {
      if (plan.current?.turn !== guesses.length) plan.current = { turn: guesses.length, code: bestGuess(level, guesses) }
      const { code } = plan.current
      const slot = row.findIndex((color, i) => color !== code[i])
      if (slot === -1) {
        submit(true)
        return
      }
      sound.peg(code[slot])
      play({ type: 'place', color: code[slot], slot, bySolver: true })
    },
  })

  const confettiBurst = useCelebration(won, () => {
    if (winResult) setDialog({ kind: 'win', result: winResult })
  })

  const showHint = () => {
    if (locked) return
    const code = bestGuess(level, guesses)
    play({ type: 'hint', code })
    sound.lift()
    setHintInfo({ fitting, worst: worstCase(level, guesses, code) })
    setNotice(null)
    announce(`Hint: try ${describeCode(code)}.`)
  }

  const begin = (next: LevelId) => {
    setSolverMode('off')
    setDialog(null)
    setNotice(null)
    setHintInfo(null)
    plan.current = null
    newGame(next)
    announce(`New code on ${LEVELS[next].name}: ${LEVELS[next].pegs} pegs, ${LEVELS[next].colors} colours.`)
  }

  const requestNew = (next: LevelId) => {
    if (status === 'playing' && guesses.length >= CONFIRM_AFTER_GUESSES) setDialog({ kind: 'confirm-new', levelId: next })
    else begin(next)
  }

  const giveUp = () => {
    setSolverMode('off')
    setDialog(null)
    if (over) return
    play({ type: 'give-up' })
    sound.lose()
    announce(`The code was ${describeCode(secret)}.`)
  }

  const requestGiveUp = () => {
    if (over) return
    if (guesses.length > 0) setDialog({ kind: 'confirm-give-up' })
    else giveUp()
  }

  const toggleSolver = () => {
    if (solverActive) {
      setSolverMode('off')
      announce('Auto-solve stopped.')
      return
    }
    if (over) return
    plan.current = null
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

    // Enter checks the row from anywhere on the board; other buttons (New, the tabs…) keep Enter.
    const outsideButton = target instanceof HTMLElement && target.closest('button, a') && !target.closest('.code-board')

    // Physical key codes, so the number row works on every keyboard layout.
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
    if (digit !== undefined) {
      // Typing colours means playing from the keyboard, so a button clicked earlier shouldn't catch Enter.
      if (outsideButton) target.blur()
      if (!event.repeat) placeColor(Number(digit) - 1)
    } else if (key === 'backspace' || key === 'delete') {
      erase()
    } else if (key === 'enter') {
      if (outsideButton) return
      if (!event.repeat) submit()
    } else if (key.startsWith('arrow')) {
      // Slots run across rows on tall boards and down columns on wide ones, so both pairs of arrows move.
      if (locked || (target instanceof Element && target.closest('.choice-group'))) return
      const back = key === 'arrowleft' || key === 'arrowup'
      selectSlot((cursor + (back ? row.length - 1 : 1)) % row.length)
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
      return {
        tone: 'success',
        text: state.solverUsed ? `Auto-solved in ${guessCount(guesses.length)}.` : `Cracked it in ${guessCount(guesses.length)}!`,
      }
    }
    if (gaveUp) return { tone: 'info', text: 'Here is the code you were after. Better luck with the next one!' }
    if (status === 'lost') return { tone: 'error', text: 'Out of guesses! The code is revealed below.' }
    if (solverActive) {
      return {
        tone: 'info',
        text: solverMode === 'paused' ? 'Auto-solve paused.' : `Auto-solving… ${plural(fitting, 'code')} still possible.`,
      }
    }
    if (notice) return notice
    if (hinted && hintInfo) {
      if (hintInfo.fitting === 1) return { tone: 'hint', text: 'Hint: only one code fits every answer so far, and this is it.' }
      return {
        tone: 'hint',
        text: `Hint: ${hintInfo.fitting.toLocaleString()} codes are still possible. Whatever its marks, this guess leaves ${hintInfo.worst.toLocaleString()} at most.`,
      }
    }
    if (status === 'ready') {
      return { tone: 'info', text: `Crack the hidden code of ${level.pegs} colours. Fill a row, then check it.` }
    }
    const last = guesses.at(-1)
    if (complete) return { tone: 'info', text: 'Row complete. Check it when you are ready.' }
    if (last && row.every((color) => color === null)) {
      return { tone: 'info', text: `${describeFeedback(last.feedback)}. ${guessCount(guessesLeft)} left.` }
    }
    return { tone: 'info', text: `${guessCount(guessesLeft)} left.` }
  })()

  const winActions = (result: WinResult): WinAction[] => {
    if (result.assistedBy === 'solver') {
      return [{ label: 'Try one yourself', icon: <Shuffle aria-hidden="true" />, primary: true, onClick: () => begin(levelId) }]
    }
    const another: WinAction = { label: 'New code', icon: <Shuffle aria-hidden="true" />, onClick: () => begin(levelId) }
    const nextLevel = LEVEL_IDS[LEVEL_IDS.indexOf(levelId) + 1]
    if (!nextLevel) return [{ ...another, primary: true }]
    return [
      another,
      {
        label: `Next: ${LEVELS[nextLevel].name}`,
        trailingIcon: <ChevronRight aria-hidden="true" />,
        primary: true,
        onClick: () => begin(nextLevel),
      },
    ]
  }

  const record = records[levelId]

  return (
    <>
      <StatsBar
        progress={{ label: 'Guesses', value: String(guesses.length), note: `${fitting.toLocaleString()} possible` }}
        elapsedMs={elapsedMs}
        status={status}
        timerPaused={solverActive || dialog !== null || paused}
        bestTimeMs={record?.timeMs}
        bestNote={record ? `${record.solved} cracked` : ''}
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
            status === 'lost' && (
              <button type="button" className="button button-primary" onClick={() => begin(levelId)}>
                <Shuffle aria-hidden="true" />
                New code
              </button>
            )
          )
        }
      >
        {message.text}
      </StatusBar>

      <div className="board-card">
        <CodeBoard
          level={level}
          guesses={guesses}
          row={row}
          cursor={cursor}
          secret={secret}
          status={status}
          gameId={state.gameId}
          hinted={hinted}
          locked={locked}
          isBlocked={(color) => !canPlace(state, color)}
          onSelect={selectSlot}
          onClear={clearSlot}
          onPlace={placeColor}
          onSubmit={() => submit()}
        />
      </div>

      <GameControls
        level={<ChoiceGroup label="Level" options={LEVEL_OPTIONS} value={levelId} onChange={requestNew} />}
        onNew={() => requestNew(levelId)}
        canRestart={status === 'playing' && !solverActive}
        restartLabel="Give up"
        restartIcon={<Flag aria-hidden="true" />}
        canHint={!locked}
        canSolve={!over}
        solverActive={solverActive}
        hintTitle="Suggest a strong guess"
        onRestart={requestGiveUp}
        onHint={showHint}
        onToggleSolver={toggleSolver}
      />

      <p className="keyboard-hint">
        <kbd>1</kbd>–<kbd>{level.colors}</kbd> colours · <kbd>←</kbd> <kbd>→</kbd> slot · <kbd>⌫</kbd> erase ·{' '}
        <kbd>Enter</kbd> check · <kbd>H</kbd> hint · <kbd>M</kbd> sound
      </p>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <Confetti burst={confettiBurst} />

      {dialog?.kind === 'win' && (
        <WinDialog
          result={dialog.result}
          perfectTitle="Masterful!"
          solvedTitle="Code cracked!"
          perfectNote={`The computer's own strategy ${parPromise(levelId)} more than ${level.par} guesses on ${level.name}, and you matched it.`}
          actions={winActions(dialog.result)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm-new' && (
        <ConfirmDialog
          title="Start a new code?"
          message={`You'll lose this game (${guessCount(guesses.length)} so far).`}
          confirmLabel="New code"
          onConfirm={() => begin(dialog.levelId)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'confirm-give-up' && (
        <ConfirmDialog
          title="Give up?"
          message="The code will be revealed, and this game ends."
          confirmLabel="Give up"
          onConfirm={giveUp}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
