import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, type StarRating, type WinResult } from '../../lib/scoring'
import type { LatinState } from './latin'

/** Three stars for no mistakes at all, two for a couple. */
const starsFor = (mistakes: number): StarRating => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1)

export interface LatinSessionConfig<S, A, L extends string> {
  reducer: (state: S, action: A) => S
  load: () => { state: S; elapsedMs: number }
  save: (state: S, elapsedMs: number) => void
  recordsKey: string
  /** A fresh puzzle's action for a level. */
  newGameAction: (levelId: L) => A
  restartAction: A
  savePreferredLevel: (levelId: L) => void
  levelName: (levelId: L) => string
  /** The figure shown beside mistakes and time in the results, such as the grid size. */
  target: (state: S) => { label: string; value: string }
}

/** A Latin-square game's state plus everything around it: the clock, saved progress and records. */
export function useLatinSession<H, S extends LatinState<H> & { levelId: L }, A, L extends string>(
  config: LatinSessionConfig<S, A, L>,
  timerPaused: boolean,
) {
  const { reducer, load, save, recordsKey, newGameAction, restartAction, savePreferredLevel, levelName, target } = config
  const { state, dispatch, stopwatch } = useGameSession({ reducer, load, save, timerPaused })
  const [records, setRecords] = useStoredState<SolveRecords>(recordsKey, {}, isSolveRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (levelId: L) => {
      dispatch(newGameAction(levelId))
      reset(0)
      savePreferredLevel(levelId)
    },
    [dispatch, reset, newGameAction, savePreferredLevel],
  )

  const restart = useCallback(() => {
    dispatch(restartAction)
    reset(0)
  }, [dispatch, reset, restartAction])

  /** Applies an action. Returns the next state, and the result when that action wins the game. */
  const act = (action: A): { next: S; result: WinResult | null } => {
    const next = reducer(state, action)
    if (next === state) return { next, result: null }
    dispatch(action)
    return { next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a solved puzzle and summarises it. */
  const recordWin = (game: S): WinResult => {
    const { mistakes, hintsUsed, solverUsed, levelId } = game
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, levelId, timeMs)
      if (solve.firstSolve) badges.push(`First ${levelName(levelId)} puzzle solved`)
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
      target: target(game),
      improveNote: 'Solve one without a single wrong digit for three stars. Notes help you be sure before you commit.',
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
