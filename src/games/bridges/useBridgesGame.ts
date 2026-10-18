import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { generatePuzzle, LEVELS, type LevelId } from './bridges'
import { bridgesReducer, type BridgesAction, type BridgesState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'

/** Bridges state plus everything around it: the clock, saved progress and best records. */
export function useBridgesGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: bridgesReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (levelId: LevelId) => {
      dispatch({ type: 'new-game', levelId, puzzle: generatePuzzle(LEVELS[levelId]) })
      reset(0)
      savePreferredLevel(levelId)
    },
    [dispatch, reset],
  )

  const restart = useCallback(() => {
    dispatch({ type: 'restart' })
    reset(0)
  }, [dispatch, reset])

  /** Applies an action. Returns the next state, and the result when that action wins the game. */
  const act = (action: BridgesAction): { next: BridgesState; result: WinResult | null } => {
    const next = bridgesReducer(state, action)
    if (next === state) return { next, result: null }
    dispatch(action)
    return { next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a solved puzzle and summarises it. */
  const recordWin = (game: BridgesState): WinResult => {
    const level = LEVELS[game.levelId]
    const { history, solution, hintsUsed, solverUsed } = game
    const moves = history.length
    const minimum = solution.reduce((sum, count) => sum + count, 0)
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, level.id, timeMs)
      if (solve.firstSolve) badges.push(`First ${level.name} puzzle solved`)
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
      target: { label: 'Bridges', value: String(minimum) },
      improveNote: `This puzzle needs ${minimum} bridges. Build them without wrong ones to finish in ${minimum} moves.`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
