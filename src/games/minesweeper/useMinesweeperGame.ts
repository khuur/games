import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { plural } from '../../lib/format'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, starRating, type WinResult } from '../../lib/scoring'
import { minesReducer, type MinesAction, type MinesState } from './gameState'
import { LEVELS, type LevelId } from './minesweeper'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'

/** Minesweeper state plus everything around it: the clock, saved progress and best records. */
export function useMinesweeperGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: minesReducer,
    load: loadInitialGame,
    save: saveGame,
    timerPaused,
  })
  const [records, setRecords] = useStoredState<SolveRecords>(RECORDS_KEY, {}, isSolveRecords)

  const { reset } = stopwatch
  const newGame = useCallback(
    (levelId: LevelId) => {
      dispatch({ type: 'new-game', levelId })
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
  const act = (action: MinesAction): { next: MinesState; result: WinResult | null } => {
    const next = minesReducer(state, action)
    if (next === state) return { next, result: null }
    dispatch(action)
    return { next, result: next.status === 'won' && state.status !== 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a cleared board and summarises the game. */
  const recordWin = (game: MinesState): WinResult => {
    const level = LEVELS[game.levelId]
    const { clicks, par, hintsUsed, solverUsed, takeBacks } = game
    const timeMs = Math.round(stopwatch.read())
    const assistedBy = assistance(solverUsed, hintsUsed + takeBacks)

    const badges: string[] = []
    if (!assistedBy) {
      const solve = addSolve(records, level.id, timeMs)
      if (solve.firstSolve) badges.push(`First board cleared on ${level.name}`)
      else if (solve.newBestTime) badges.push('New best time')
      setRecords(solve.records)
    }

    const help = [hintsUsed && `used ${plural(hintsUsed, 'hint')}`, takeBacks && `took back ${plural(takeBacks, 'mine')}`]
    return {
      moves: clicks,
      movesLabel: 'Clicks',
      timeMs,
      stars: starRating(clicks, par),
      perfect: clicks <= par,
      assistedBy,
      hintsUsed,
      badges,
      target: { label: 'Par', value: String(par) },
      improveNote: `Par is ${par}: the clicks this board takes without flags or chords. Open empty areas in one click, and chord to beat it.`,
      assistNote: `You ${help.filter(Boolean).join(' and ')}, so this board doesn't count toward your best scores.`,
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
