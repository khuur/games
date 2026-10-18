import { useCallback, useEffect, useEffectEvent, useReducer, useState } from 'react'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStopwatch } from '../hooks/useStopwatch'
import { useStoredState } from '../hooks/useStoredState'
import { gameReducer, type GameAction, type GameState } from './gameState'
import { clampDiskCount, minimumMoves, starRating, type StarRating } from './hanoi'
import {
  isRecords,
  loadInitialGame,
  RECORDS_KEY,
  saveGame,
  savePreferredDiskCount,
  type Records,
} from './persistence'

export interface WinResult {
  diskCount: number
  moves: number
  minimum: number
  timeMs: number
  stars: StarRating
  assistedBy: 'solver' | 'hints' | null
  hintsUsed: number
  undosUsed: number
  newBestMoves: boolean
  newBestTime: boolean
  firstSolve: boolean
}

/** Game state plus everything around it: the clock, saving progress and best records. */
export function useHanoiGame({ timerPaused }: { timerPaused: boolean }) {
  const [initial] = useState(loadInitialGame)
  const [state, dispatch] = useReducer(gameReducer, initial.state)
  const visible = usePageVisible()
  const stopwatch = useStopwatch(state.status === 'playing' && visible && !timerPaused, initial.elapsedMs)
  const [records, setRecords] = useStoredState<Records>(RECORDS_KEY, {}, isRecords)

  const persist = useEffectEvent(() => saveGame(state, stopwatch.read()))

  useEffect(() => {
    persist()
  }, [state])

  useEffect(() => {
    // The clock keeps moving between state changes, so save it when the page goes away too.
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    const save = () => persist()
    document.addEventListener('visibilitychange', saveIfHidden)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', saveIfHidden)
      window.removeEventListener('pagehide', save)
    }
  }, [])

  const { reset } = stopwatch
  const newGame = useCallback(
    (diskCount: number) => {
      const count = clampDiskCount(diskCount)
      dispatch({ type: 'new-game', diskCount: count })
      reset(0)
      savePreferredDiskCount(count)
    },
    [reset],
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
    const { diskCount, history, hintsUsed, undosUsed, solverUsed } = game
    const moves = history.length
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = solverUsed ? 'solver' : hintsUsed > 0 ? 'hints' : null
    const previous = records[diskCount]
    const newBestMoves = !assistedBy && (!previous || moves < previous.moves)
    const newBestTime = !assistedBy && (!previous || timeMs < previous.timeMs)
    if (newBestMoves || newBestTime) {
      setRecords({
        ...records,
        [diskCount]: {
          moves: Math.min(moves, previous?.moves ?? moves),
          timeMs: Math.min(timeMs, previous?.timeMs ?? timeMs),
        },
      })
    }
    return {
      diskCount,
      moves,
      minimum: minimumMoves(diskCount),
      timeMs,
      stars: starRating(moves, diskCount),
      assistedBy,
      hintsUsed,
      undosUsed,
      newBestMoves,
      newBestTime,
      firstSolve: !assistedBy && !previous,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame }
}
