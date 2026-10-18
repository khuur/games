import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, type WinResult } from '../../lib/scoring'
import { pegReducer, type PegAction, type PegState } from './gameState'
import { BOARDS, type BoardId } from './pegSolitaire'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredBoard } from './persistence'

/** Peg Solitaire state plus everything around it: the clock, saved progress and best records. */
export function usePegGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: pegReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (boardId: BoardId) => {
      dispatch({ type: 'new-game', boardId })
      reset(0)
      savePreferredBoard(boardId)
    },
    [dispatch, reset],
  )

  /** Applies an action. Returns the result when that action wins the game. */
  const act = (action: PegAction): WinResult | null => {
    const next = pegReducer(state, action)
    if (next === state) return null
    dispatch(action)
    return next.status === 'won' ? recordWin(next) : null
  }

  /** Stores any new records for a finished game and summarises it. */
  const recordWin = (game: PegState): WinResult => {
    const { boardId, pegs, history, hintsUsed, solverUsed } = game
    const board = BOARDS[boardId]
    const perfect = pegs[board.goalHole]
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)
    const goalName = boardId === 'english' ? 'centre' : 'top hole'

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, boardId, timeMs)
      if (solve.firstSolve) badges.push(`First solve on ${board.phrase}`)
      else if (solve.newBestTime) badges.push('New best time')
      setRecords(solve.records)
    }

    return {
      moves: history.length,
      timeMs,
      stars: perfect ? 3 : 2,
      perfect,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Last peg', value: perfect ? (boardId === 'english' ? 'Centre' : 'Top') : 'Elsewhere' },
      improveNote: `One peg left, but not in the ${goalName}. Can you finish there for three stars?`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame }
}
