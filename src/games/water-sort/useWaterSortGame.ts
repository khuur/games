import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { waterSortReducer, type WaterSortAction, type WaterSortState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredColors } from './persistence'
import { clampColors, generatePuzzle } from './waterSort'

/** Water Sort state plus everything around it: the clock, saved progress and best records. */
export function useWaterSortGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: waterSortReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newPuzzle = useCallback(
    (colors: number) => {
      const clamped = clampColors(colors)
      const { tubes, minimum } = generatePuzzle(clamped)
      dispatch({ type: 'new-puzzle', colors: clamped, start: tubes, minimum })
      reset(0)
      savePreferredColors(clamped)
    },
    [dispatch, reset],
  )

  const restart = useCallback(() => {
    dispatch({ type: 'restart' })
    reset(0)
  }, [dispatch, reset])

  /** Applies an action. Returns the result when that action wins the game. */
  const act = (action: WaterSortAction): WinResult | null => {
    const next = waterSortReducer(state, action)
    if (next === state) return null
    dispatch(action)
    return next.status === 'won' ? recordWin(next) : null
  }

  /** Stores any new records for a finished puzzle and summarises it. */
  const recordWin = (game: WaterSortState): WinResult => {
    const { colors, history, minimum, hintsUsed, solverUsed } = game
    const moves = history.length
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, colors, timeMs)
      if (solve.firstSolve) badges.push(`First solve with ${colors} colours`)
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
      improveNote: `This puzzle can be sorted in ${minimum} pours. Can you find them?`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newPuzzle, restart }
}
