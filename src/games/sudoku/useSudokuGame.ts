import { useCallback } from 'react'
import { useGameSession } from '../../hooks/useGameSession'
import { useStoredState } from '../../hooks/useStoredState'
import { addSolve, isSolveRecords, type SolveRecords } from '../../lib/records'
import { assistance, type StarRating, type WinResult } from '../../lib/scoring'
import { sudokuReducer, type SudokuAction, type SudokuState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'
import { generatePuzzle, LEVELS, type LevelId } from './sudoku'

/** Three stars for no mistakes at all, two for a couple. */
const starsFor = (mistakes: number): StarRating => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1)

/** Sudoku state plus everything around it: the clock, saved progress and best records. */
export function useSudokuGame({ timerPaused }: { timerPaused: boolean }) {
  const { state, dispatch, stopwatch } = useGameSession({
    reducer: sudokuReducer,
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
  const act = (action: SudokuAction): { next: SudokuState; result: WinResult | null } => {
    const next = sudokuReducer(state, action)
    if (next === state) return { next, result: null }
    dispatch(action)
    return { next, result: next.status === 'won' ? recordWin(next) : null }
  }

  /** Stores any new records for a solved puzzle and summarises it. */
  const recordWin = (game: SudokuState): WinResult => {
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
      target: { label: 'Level', value: level.name },
      improveNote: 'Solve one without a single wrong digit for three stars. Notes help you be sure before you commit.',
    }
  }

  return { state, act, elapsedMs: stopwatch.elapsed, records, newGame, restart }
}
