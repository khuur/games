import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { fifteenReducer, type FifteenAction, type FifteenState } from './gameState'
import { clampSize, generatePuzzle, puzzleTarget } from './fifteen'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredSize } from './persistence'

/** 15 Puzzle state plus everything around it: the clock, saved progress and best records. */
export function useFifteenGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: fifteenReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newPuzzle = useCallback(
    (size: number) => {
      const clamped = clampSize(size)
      const start = generatePuzzle(clamped)
      dispatch({ type: 'new-puzzle', size: clamped, start, target: puzzleTarget(start, clamped) })
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
  const act = (action: FifteenAction): WinResult | null => {
    const next = fifteenReducer(state, action)
    if (next === state) return null
    dispatch(action)
    return next.status === 'won' ? recordWin(next) : null
  }

  /** Stores any new records for a finished puzzle and summarises it. */
  const recordWin = (game: FifteenState): WinResult => {
    const { size, history, target, hintsUsed, solverUsed } = game
    const moves = history.length
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)
    const exact = size === 3

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
      stars: starRating(moves, target),
      perfect: moves <= target,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: exact ? 'Minimum' : 'Par', value: String(target) },
      improveNote: exact
        ? `The shortest solution takes ${target} moves. Can you find it?`
        : `Par is ${target} moves, the classic row-by-row method. Can you beat it?`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newPuzzle, restart }
}
