import { describe, expect, it } from 'vitest'
import { createGame, cycled, restoreGame, takuzuReducer, toSnapshot, type TakuzuAction, type TakuzuState } from './gameState'
import { EMPTY, findHint, generatePuzzle, LEVELS, MOON, SUN } from './takuzu'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.easy, seededRandom(5))
const BLANKS = PUZZLE.givens.flatMap((value, cell) => (value ? [] : [cell]))
const GIVEN = PUZZLE.givens.findIndex(Boolean)
const run = (state: TakuzuState, ...actions: TakuzuAction[]) => actions.reduce(takuzuReducer, state)
const set = (cell: number, value = PUZZLE.solution[cell]): TakuzuAction => ({ type: 'set', cell, value })
const game = () => createGame('easy', PUZZLE)

describe('takuzuReducer', () => {
  it('cycles blank, sun, moon', () => {
    expect(([EMPTY, SUN, MOON] as const).map((value) => cycled(value))).toEqual([SUN, MOON, EMPTY])
  })

  it('places symbols in blank cells, but leaves givens alone', () => {
    const state = run(game(), set(BLANKS[0]))
    expect(state.cells[BLANKS[0]]).toBe(PUZZLE.solution[BLANKS[0]])
    expect(state.status).toBe('playing')
    expect(run(state, set(GIVEN, EMPTY))).toBe(state)
  })

  it('counts a move that breaks a rule as a mistake, even once undone', () => {
    // Fill a whole row with suns: by the time it holds three in a row, rules are broken.
    let state = game()
    for (let column = 0; column < 6; column++) state = run(state, set(column, SUN))
    expect(state.mistakes).toBeGreaterThan(0)
    const mistakes = state.mistakes
    for (let i = 0; i < 6; i++) state = run(state, { type: 'undo' })
    expect(state.mistakes).toBe(mistakes)
  })

  it('wins once the grid is full and breaks no rule', () => {
    const won = run(game(), ...BLANKS.map((cell) => set(cell)))
    expect(won.status).toBe('won')
    expect(won.mistakes).toBe(0)
    expect(run(won, set(BLANKS[0], EMPTY))).toBe(won)
  })

  it('undoes and redoes', () => {
    const state = run(game(), set(BLANKS[0]), { type: 'undo' })
    expect(state.cells[BLANKS[0]]).toBe(EMPTY)
    expect(run(state, { type: 'redo' }).cells[BLANKS[0]]).toBe(PUZZLE.solution[BLANKS[0]])
    expect(run(state, set(BLANKS[1])).future).toEqual([])
  })

  it('counts a hint once, and the solver', () => {
    const hint = findHint(6, game().cells, PUZZLE.signs, PUZZLE.solution)!
    expect(run(game(), { type: 'hint', hint }, { type: 'hint', hint }).hintsUsed).toBe(1)
    expect(run(game(), { type: 'apply', changes: [{ cell: BLANKS[0], value: SUN }], bySolver: true }).solverUsed).toBe(true)
  })

  it('restarts the same puzzle', () => {
    const state = run(game(), set(BLANKS[0]), { type: 'restart' })
    expect(state.cells).toEqual(PUZZLE.givens)
    expect(state.gameId).toBe(1)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(game(), set(BLANKS[0]), set(BLANKS[1]), { type: 'undo' })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.cells).toEqual(played.cells)
    expect(restored.future).toEqual(played.future)
    expect(restored.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(game(), set(BLANKS[0])))
    expect(restoreGame({ ...snapshot, levelId: 'huge' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, cells: snapshot.cells.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, signs: [{ a: 0, b: 2, same: true }] })).toBeNull()
    expect(restoreGame({ ...snapshot, cells: snapshot.cells.map((value, cell) => (cell === GIVEN ? EMPTY : value)) })).toBeNull()
    expect(restoreGame(toSnapshot(run(game(), ...BLANKS.map((cell) => set(cell)))))).toBeNull()
  })
})
