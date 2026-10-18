import { describe, expect, it } from 'vitest'
import type { SavedLatinGame } from '../latin/latinStorage'
import { generatePuzzle, LEVELS, type LevelId } from './calcudoku'
import { calcudokuReducer, createGame, packCages, restoreGame, type CalcudokuAction, type CalcudokuState } from './gameState'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.medium, seededRandom(6))
const run = (state: CalcudokuState, ...actions: CalcudokuAction[]) => actions.reduce(calcudokuReducer, state)
const enter = (cell: number, digit = PUZZLE.solution[cell]): CalcudokuAction => ({ type: 'enter', cell, digit })
const game = () => createGame('medium', PUZZLE)

const saved = (state: CalcudokuState, changes: Partial<SavedLatinGame<LevelId>> = {}): SavedLatinGame<LevelId> => ({
  levelId: state.levelId,
  givens: state.givens,
  solution: state.solution,
  puzzle: packCages(state.cages),
  history: state.history,
  future: state.future,
  mistakes: state.mistakes,
  hintsUsed: state.hintsUsed,
  solverUsed: state.solverUsed,
  ...changes,
})

describe('calcudokuReducer', () => {
  it('starts with an empty grid, and a new puzzle on request', () => {
    expect(game().values.every((value) => value === 0)).toBe(true)
    const next = generatePuzzle(LEVELS.easy, seededRandom(7))
    const state = run(game(), enter(0), { type: 'new-game', levelId: 'easy', puzzle: next })
    expect(state.size).toBe(4)
    expect(state.cages).toEqual(next.cages)
    expect(state.values).toEqual(new Array<number>(16).fill(0))
  })

  it('lights up a finished cage', () => {
    const cage = PUZZLE.cages.find((candidate) => candidate.cells.length >= 2)!
    const [last, ...rest] = [...cage.cells].reverse()
    const state = run(game(), ...rest.map((cell) => enter(cell)), enter(last))
    expect(state.lastMove?.completed).toEqual(expect.arrayContaining(cage.cells))
  })

  it('keeps the cages on a restart, and wins once every digit is right', () => {
    const state = run(game(), enter(0), { type: 'restart' })
    expect(state.cages).toEqual(PUZZLE.cages)
    const won = run(game(), ...PUZZLE.solution.map((_, cell) => enter(cell)))
    expect(won.status).toBe('won')
  })
})

describe('restoreGame', () => {
  it('rebuilds a game in progress', () => {
    const played = run(game(), enter(0), enter(1, (PUZZLE.solution[1] % 5) + 1))
    const restored = restoreGame(saved(played))
    expect(restored?.values).toEqual(played.values)
    expect(restored?.cages).toEqual(PUZZLE.cages)
    expect(restored?.mistakes).toBe(1)
  })

  it('refuses saved games that do not add up', () => {
    const state = game()
    const packed = packCages(PUZZLE.cages)
    expect(restoreGame(saved(state))).not.toBeNull()
    expect(restoreGame(saved(state, { puzzle: 'cages' }))).toBeNull()
    // A cage missing, so some cells have none.
    expect(restoreGame(saved(state, { puzzle: packed.slice(1) }))).toBeNull()
    // A target the solution doesn't make.
    expect(restoreGame(saved(state, { puzzle: packed.map((cage, i) => (i ? cage : [cage[0], Number(cage[1]) + 1, ...cage.slice(2)])) }))).toBeNull()
    // An unknown sign, or a difference over three cells.
    expect(restoreGame(saved(state, { puzzle: packed.map((cage, i) => (i ? cage : ['%', ...cage.slice(1)])) }))).toBeNull()
    const triple = packed.findIndex((cage) => cage.length >= 5)
    if (triple >= 0) expect(restoreGame(saved(state, { puzzle: packed.map((cage, i) => (i === triple ? ['-', ...cage.slice(1)] : cage)) }))).toBeNull()
    // A cell in two cages.
    expect(restoreGame(saved(state, { puzzle: [...packed, ['=', PUZZLE.solution[0], 0]] }))).toBeNull()
    // Givens: Calcudoku has none.
    expect(restoreGame(saved(state, { givens: PUZZLE.solution }))).toBeNull()
    expect(restoreGame(saved(state, { levelId: 'hard' }))).toBeNull()
  })
})
