import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { LEVELS, randomCode, type LevelId } from './codeBreaker'
import { codeBreakerReducer, type CodeBreakerAction, type CodeBreakerState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'

/** How sure the par is: proven on the smaller levels, measured on Hard. */
export const parPromise = (levelId: LevelId) => (levelId === 'hard' ? 'rarely needs' : 'never needs')

/** Code Breaker state plus everything around it: the clock, saved progress and best records. */
export function useCodeBreakerGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: codeBreakerReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (levelId: LevelId) => {
      dispatch({ type: 'new-game', levelId, secret: randomCode(LEVELS[levelId]) })
      reset(0)
      savePreferredLevel(levelId)
    },
    [dispatch, reset],
  )

  /** Applies an action. Returns the next state, and the result when that action wins the game. */
  const act = (action: CodeBreakerAction): { next: CodeBreakerState; result: WinResult | null } => {
    const next = codeBreakerReducer(state, action)
    if (next === state) return { next, result: null }
    dispatch(action)
    return { next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a cracked code and summarises the game. */
  const recordWin = (game: CodeBreakerState): WinResult => {
    const level = LEVELS[game.levelId]
    const { guesses, hintsUsed, solverUsed } = game
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, level.id, timeMs)
      if (solve.firstSolve) badges.push(`First code cracked on ${level.name}`)
      else if (solve.newBestTime) badges.push('New best time')
      setRecords(solve.records)
    }

    return {
      moves: guesses.length,
      movesLabel: 'Guesses',
      timeMs,
      stars: starRating(guesses.length, level.par),
      perfect: guesses.length <= level.par,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Par', value: String(level.par) },
      improveNote: `The computer's own strategy ${parPromise(level.id)} more than ${level.par} guesses here. Can you match it?`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame }
}
