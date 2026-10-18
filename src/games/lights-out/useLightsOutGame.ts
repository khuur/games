import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { starRating, type WinResult } from '../../lib/scoring'
import { lightsOutReducer, type LightsOutAction, type LightsOutState } from './gameState'
import { clampSize, generatePuzzle } from './lightsOut'
import {
  isRecords,
  loadInitialGame,
  RECORDS_KEY,
  saveGame,
  savePreferredSize,
  type LightsOutRecords,
} from './persistence'

/** Lights Out state plus everything around it: the clock, saved progress and best records. */
export function useLightsOutGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: lightsOutReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<LightsOutRecords>(RECORDS_KEY, {}, isRecords)

  const { reset } = stopwatch
  const newPuzzle = useCallback(
    (size: number) => {
      const clamped = clampSize(size)
      dispatch({ type: 'new-puzzle', size: clamped, start: generatePuzzle(clamped) })
      reset(0)
      savePreferredSize(clamped)
    },
    [dispatch, reset],
  )

  const restart = useCallback(() => {
    dispatch({ type: 'restart' })
    reset(0)
  }, [dispatch, reset])

  /** Applies an action. Returns the result when that action wins the game. */
  const act = (action: LightsOutAction): WinResult | null => {
    const next = lightsOutReducer(state, action)
    if (next === state) return null
    dispatch(action)
    return next.status === 'won' ? recordWin(next) : null
  }

  /** Stores any new records for a finished puzzle and summarises it. */
  const recordWin = (game: LightsOutState): WinResult => {
    const { size, history, minimum, hintsUsed, solverUsed } = game
    const moves = history.length
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = solverUsed ? 'solver' : hintsUsed > 0 ? 'hints' : null
    const previous = records[size]

    const badges: string[] = []
    if (!assistedBy) {
      if (!previous) badges.push(`First solve on ${size}×${size}`)
      else if (timeMs < previous.timeMs) badges.push('New best time')
      setRecords({
        ...records,
        [size]: { timeMs: Math.min(timeMs, previous?.timeMs ?? timeMs), solved: (previous?.solved ?? 0) + 1 },
      })
    }

    return { moves, minimum, timeMs, stars: starRating(moves, minimum), assistedBy, hintsUsed, badges }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newPuzzle, restart }
}
