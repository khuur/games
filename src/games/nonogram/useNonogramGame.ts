import { useCallback, useLayoutEffect, useRef } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, type StarRating, type WinResult } from '../../lib/scoring'
import { nonogramReducer, type NonogramAction, type NonogramState } from './gameState'
import { generatePuzzle, LEVELS, type LevelId } from './nonogram'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'

/** Three stars for no mistakes at all, two for a couple. */
const starsFor = (mistakes: number): StarRating => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1)

/** Nonogram state plus everything around it: the clock, saved progress and best records. */
export function useNonogramGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: nonogramReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)
  // Painting sends a move for every pointer movement, faster than React re-renders, so moves
  // are worked out from the latest state rather than the one this render saw.
  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  })

  const { reset } = stopwatch
  const newGame = useCallback(
    (levelId: LevelId) => {
      dispatch({ type: 'new-game', levelId, solution: generatePuzzle(LEVELS[levelId]) })
      reset(0)
      savePreferredLevel(levelId)
    },
    [dispatch, reset],
  )

  const restart = useCallback(() => {
    dispatch({ type: 'restart' })
    reset(0)
  }, [dispatch, reset])

  /**
   * Applies an action. Returns the state before and after it, and the result when that action
   * wins the game.
   */
  const act = (action: NonogramAction): { previous: NonogramState; next: NonogramState; result: WinResult | null } => {
    const previous = latest.current
    const next = nonogramReducer(previous, action)
    if (next === previous) return { previous, next, result: null }
    latest.current = next
    dispatch(action)
    return { previous, next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a solved picture and summarises it. */
  const recordWin = (game: NonogramState): WinResult => {
    const level = LEVELS[game.levelId]
    const { mistakes, hintsUsed, solverUsed } = game
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, level.id, timeMs)
      if (solve.firstSolve) badges.push(`First ${level.name} picture revealed`)
      else if (solve.newBestTime) badges.push('New best time')
      setRecords(solve.records)
    }

    return {
      moves: mistakes,
      movesLabel: 'Mistakes',
      timeMs,
      stars: starsFor(mistakes),
      perfect: mistakes === 0,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Size', value: `${level.columns}×${level.rows}` },
      improveNote: 'Reveal a picture without a single wrong cell for three stars. Cross out cells you are sure are empty.',
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
