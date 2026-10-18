import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { starRating, type WinResult } from '../../lib/scoring'
import { gameReducer, type GameAction, type GameState } from './gameState'
import { clampDiskCount, minimumMoves } from './hanoi'
import { isRecords, loadInitialGame, RECORDS_KEY, saveGame, savePreferredDiskCount, type Records } from './persistence'

/** Tower of Hanoi state plus everything around it: the clock, saved progress and best records. */
export function useHanoiGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: gameReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<Records>(RECORDS_KEY, {}, isRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (diskCount: number) => {
      const count = clampDiskCount(diskCount)
      dispatch({ type: 'new-game', diskCount: count })
      reset(0)
      savePreferredDiskCount(count)
    },
    [dispatch, reset],
  )

  /** Applies an action. Returns the result when that action wins the game. */
  const act = (action: GameAction): WinResult | null => {
    const next = gameReducer(state, action)
    if (next === state) return null
    dispatch(action)
    return next.status === 'won' ? recordWin(next) : null
  }

  /** Stores any new records for a finished game and summarises it. */
  const recordWin = (game: GameState): WinResult => {
    const { diskCount, history, hintsUsed, solverUsed } = game
    const moves = history.length
    const minimum = minimumMoves(diskCount)
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = solverUsed ? 'solver' : hintsUsed > 0 ? 'hints' : null
    const previous = records[diskCount]

    const badges: string[] = []
    if (!assistedBy) {
      const newBestMoves = !previous || moves < previous.moves
      const newBestTime = !previous || timeMs < previous.timeMs
      if (!previous) badges.push(`First solve with ${diskCount} disks`)
      else {
        if (newBestTime) badges.push('New best time')
        if (newBestMoves) badges.push('New fewest moves')
      }
      if (newBestMoves || newBestTime) {
        setRecords({
          ...records,
          [diskCount]: {
            moves: Math.min(moves, previous?.moves ?? moves),
            timeMs: Math.min(timeMs, previous?.timeMs ?? timeMs),
          },
        })
      }
    }

    return { moves, minimum, timeMs, stars: starRating(moves, minimum), assistedBy, hintsUsed, badges }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame }
}
