import { useCallback, useLayoutEffect, useRef } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, type StarRating, type WinResult } from '../../lib/scoring'
import { queensReducer, type QueensAction, type QueensState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'
import { generatePuzzle, LEVELS, type LevelId } from './queens'

/** Three stars for no mistakes at all, two for a couple. */
const starsFor = (mistakes: number): StarRating => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1)

/** Queens state plus everything around it: the clock, saved progress and best records. */
export function useQueensGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: queensReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)
  // Dragging crosses sends a move for every pointer movement, faster than React re-renders, so
  // moves are worked out from the latest state rather than the one this render saw.
  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  })

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

  /** Applies an action. Returns the state before and after it, and the result when it wins the game. */
  const act = (action: QueensAction): { previous: QueensState; next: QueensState; result: WinResult | null } => {
    const previous = latest.current
    const next = queensReducer(previous, action)
    if (next === previous) return { previous, next, result: null }
    latest.current = next
    dispatch(action)
    return { previous, next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a solved puzzle and summarises it. */
  const recordWin = (game: QueensState): WinResult => {
    const level = LEVELS[game.levelId]
    const { mistakes, hintsUsed, solverUsed } = game
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
      moves: mistakes,
      movesLabel: 'Mistakes',
      timeMs,
      stars: starsFor(mistakes),
      perfect: mistakes === 0,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Board', value: `${level.size}×${level.size}` },
      improveNote: 'Place every queen without a wrong one for three stars. Cross out cells first to be sure.',
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
