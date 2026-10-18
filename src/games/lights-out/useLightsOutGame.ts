import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { lightsOutReducer, type LightsOutAction, type LightsOutState } from './gameState'
import { clampSize, generatePuzzle } from './lightsOut'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredSize } from './persistence'

/** Lights Out state plus everything around it: the clock, saved progress and best records. */
export function useLightsOutGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: lightsOutReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

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
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, size, timeMs)
      if (solve.firstSolve) badges.push(`First solve on ${size}×${size}`)
      else if (solve.newBestTime) badges.push('New best time')
      setRecords(solve.records)
    }

    return {
      moves,
      timeMs,
      stars: starRating(moves, minimum),
      perfect: moves <= minimum,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Minimum', value: String(minimum) },
      improveNote: `This puzzle can be solved in ${minimum} presses. Can you find them?`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newPuzzle, restart }
}
