import { describe, expect, it } from 'vitest'
import type { SavedLatinGame } from '../latin/latinStorage'
import { createGame, restoreGame, skyscrapersReducer, type SkyscrapersAction, type SkyscrapersState } from './gameState'
import { generatePuzzle, LEVELS, type LevelId } from './skyscrapers'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.medium, seededRandom(8))
const BLANKS = PUZZLE.givens.flatMap((digit, cell) => (digit ? [] : [cell]))
const run = (state: SkyscrapersState, ...actions: SkyscrapersAction[]) => actions.reduce(skyscrapersReducer, state)
const enter = (cell: number, digit = PUZZLE.solution[cell]): SkyscrapersAction => ({ type: 'enter', cell, digit })
const game = () => createGame('medium', PUZZLE)

const saved = (state: SkyscrapersState, changes: Partial<SavedLatinGame<LevelId>> = {}): SavedLatinGame<LevelId> => ({
  levelId: state.levelId,
  givens: state.givens,
  solution: state.solution,
  puzzle: state.clues,
  history: state.history,
  future: state.future,
  mistakes: state.mistakes,
  hintsUsed: state.hintsUsed,
  solverUsed: state.solverUsed,
  ...changes,
})

describe('skyscrapersReducer', () => {
  it('starts a new puzzle', () => {
    const next = generatePuzzle(LEVELS.easy, seededRandom(9))
    const state = run(game(), enter(BLANKS[0]), { type: 'new-game', levelId: 'easy', puzzle: next })
    expect(state.levelId).toBe('easy')
    expect(state.size).toBe(4)
    expect(state.clues).toEqual(next.clues)
    expect(state.values).toEqual(next.givens)
    expect(state.gameId).toBe(1)
  })

  it('keeps the clues on a restart', () => {
    const state = run(game(), enter(BLANKS[0]), { type: 'restart' })
    expect(state.clues).toEqual(PUZZLE.clues)
    expect(state.levelId).toBe('medium')
    expect(state.values).toEqual(PUZZLE.givens)
  })

  it('wins once the grid is full and right', () => {
    const won = run(game(), ...BLANKS.map((cell) => enter(cell)))
    expect(won.status).toBe('won')
    expect(won.mistakes).toBe(0)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game in progress', () => {
    const played = run(game(), enter(BLANKS[0]), enter(BLANKS[1], (PUZZLE.solution[BLANKS[1]] % 5) + 1))
    const restored = restoreGame(saved(played))
    expect(restored?.values).toEqual(played.values)
    expect(restored?.clues).toEqual(PUZZLE.clues)
    expect(restored?.mistakes).toBe(1)
  })

  it('refuses saved games that do not add up', () => {
    const state = game()
    expect(restoreGame(saved(state))).not.toBeNull()
    expect(restoreGame(saved(state, { levelId: 'hard' }))).toBeNull()
    expect(restoreGame(saved(state, { puzzle: 'clues' }))).toBeNull()
    expect(restoreGame(saved(state, { puzzle: PUZZLE.clues.slice(1) }))).toBeNull()
    // A clue that the solution doesn't show.
    const index = PUZZLE.clues.findIndex(Boolean)
    const wrongClues = PUZZLE.clues.map((clue, i) => (i === index ? (clue % 5) + 1 : clue))
    expect(restoreGame(saved(state, { puzzle: wrongClues }))).toBeNull()
    // A solution with a digit twice in a row.
    const broken = PUZZLE.solution.map((digit, cell) => (cell === 1 ? PUZZLE.solution[0] : digit))
    expect(restoreGame(saved(state, { solution: broken }))).toBeNull()
    // A given that isn't in the solution.
    const givens = PUZZLE.givens.map((digit, cell) => (cell === BLANKS[0] ? (PUZZLE.solution[cell] % 5) + 1 : digit))
    expect(restoreGame(saved(state, { givens }))).toBeNull()
  })
})
