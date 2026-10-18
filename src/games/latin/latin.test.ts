import { describe, expect, it } from 'vitest'
import {
  bitCount,
  digitBit,
  digitsIn,
  freshState,
  isEditable,
  isLatinConsistent,
  latinReducer,
  linesOf,
  packMove,
  peersOf,
  randomLatinSquare,
  restoreProgress,
  unpackMove,
  type LatinAction,
  type LatinState,
} from './latin'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// prettier-ignore
const SOLUTION = [
  1, 2, 3, 4,
  3, 4, 1, 2,
  2, 1, 4, 3,
  4, 3, 2, 1,
]
/** The diagonal is given. */
const GIVENS = SOLUTION.map((digit, cell) => ([0, 5, 10, 15].includes(cell) ? digit : 0))

type State = LatinState<string>
const run = (state: State, ...actions: LatinAction<string>[]) =>
  actions.reduce((current, action) => latinReducer<string, State>(current, action), state)
const enter = (cell: number, digit: number, note = false): LatinAction<string> => ({ type: 'enter', cell, digit, note })
const game = () => freshState<string>(4, GIVENS, SOLUTION)
const BLANKS = GIVENS.flatMap((digit, cell) => (digit ? [] : [cell]))

describe('grid helpers', () => {
  it('works with digit masks', () => {
    expect(digitsIn(digitBit(1) | digitBit(2) | digitBit(4))).toEqual([1, 2, 4])
    expect(bitCount(0b1011)).toBe(3)
  })

  it('lists rows, then columns', () => {
    expect(linesOf(3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
    ])
    expect(peersOf(4)[5].sort((a, b) => a - b)).toEqual([1, 4, 6, 7, 9, 13])
  })

  it('makes random Latin squares', () => {
    const random = seededRandom(3)
    for (let size = 3; size <= 7; size++) {
      const square = randomLatinSquare(size, random)
      expect(square).toHaveLength(size * size)
      expect(square.every((digit) => digit >= 1 && digit <= size)).toBe(true)
      expect(isLatinConsistent(size, square)).toBe(true)
    }
  })

  it('spots a digit twice in a line', () => {
    expect(isLatinConsistent(4, GIVENS)).toBe(true)
    expect(isLatinConsistent(4, [1, 0, 0, 1, ...new Array<number>(12).fill(0)])).toBe(false)
    expect(isLatinConsistent(4, [1, 0, 0, 0, 1, ...new Array<number>(11).fill(0)])).toBe(false)
    expect(isLatinConsistent(4, [5, ...new Array<number>(15).fill(0)])).toBe(false)
  })
})

describe('latinReducer', () => {
  it('places digits, starting the game', () => {
    const state = run(game(), enter(1, 2))
    expect(state.values[1]).toBe(2)
    expect(state.status).toBe('playing')
    expect(state.mistakes).toBe(0)
  })

  it('leaves givens and right digits alone', () => {
    const state = run(game(), enter(1, 2))
    expect(isEditable(state, 0)).toBe(false)
    expect(isEditable(state, 1)).toBe(false)
    expect(run(state, enter(0, 3))).toBe(state)
    expect(run(state, enter(1, 0))).toBe(state)
  })

  it('counts wrong digits as mistakes, even once undone', () => {
    const state = run(game(), enter(1, 3))
    expect(state.mistakes).toBe(1)
    expect(isEditable(state, 1)).toBe(true)
    const undone = run(state, { type: 'undo' })
    expect(undone.values[1]).toBe(0)
    expect(undone.mistakes).toBe(1)
    expect(run(undone, { type: 'redo' }).mistakes).toBe(1)
    // Swapping one wrong digit for another is a second mistake; erasing is not.
    expect(run(state, enter(1, 4)).mistakes).toBe(2)
    expect(run(state, enter(1, 0)).mistakes).toBe(1)
  })

  it('pencils in notes, and tidies them when a digit goes in', () => {
    let state = run(game(), enter(1, 2, true), enter(1, 3, true), enter(2, 2, true), enter(9, 2, true))
    expect(digitsIn(state.notes[1])).toEqual([2, 3])
    state = run(state, enter(1, 3, true))
    expect(digitsIn(state.notes[1])).toEqual([2])
    // A 2 in cell 3 clears the 2s from its row (cells 1 and 2) but not from cell 9.
    state = run(state, enter(3, 2))
    expect(state.notes[1]).toBe(0)
    expect(state.notes[2]).toBe(0)
    expect(digitsIn(state.notes[9])).toEqual([2])
    // No notes over a digit.
    expect(run(state, enter(3, 1, true))).toBe(state)
  })

  it('erases a digit, then notes', () => {
    const state = run(game(), enter(1, 3), enter(1, 0))
    expect(state.values[1]).toBe(0)
    const noted = run(game(), enter(1, 2, true), enter(1, 0))
    expect(noted.notes[1]).toBe(0)
    expect(run(game(), enter(1, 0))).toEqual(game())
  })

  it('marks finished lines, and extra units such as cages', () => {
    const row = run(game(), enter(1, 2), enter(2, 3))
    expect(row.lastMove?.completed).toEqual([])
    const done = run(row, enter(3, 4))
    expect(done.lastMove?.completed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
    const caged = latinReducer<string, State>(game(), enter(1, 2), [[0, 1]])
    expect(caged.lastMove?.completed).toEqual([0, 1])
  })

  it('wins once every digit is right', () => {
    const won = run(game(), ...BLANKS.map((cell) => enter(cell, SOLUTION[cell])))
    expect(won.status).toBe('won')
    expect(run(won, { type: 'undo' })).toBe(won)
    expect(run(won, enter(1, 3))).toBe(won)
  })

  it('undoes and redoes, and a new move clears what could be redone', () => {
    const state = run(game(), enter(1, 2), enter(2, 3), { type: 'undo' })
    expect(state.values[2]).toBe(0)
    expect(state.future).toHaveLength(1)
    expect(run(state, { type: 'redo' }).values[2]).toBe(3)
    expect(run(state, enter(4, 3)).future).toEqual([])
  })

  it('restarts with a fresh grid', () => {
    const state = run(game(), enter(1, 3), enter(2, 3))
    const restarted = run(state, { type: 'restart' })
    expect(restarted.values).toEqual(GIVENS)
    expect(restarted.mistakes).toBe(0)
    expect(restarted.gameId).toBe(state.gameId + 1)
  })

  it('counts a hint once while it shows, and notes the solver', () => {
    const state = run(game(), { type: 'hint', hint: 'a' }, { type: 'hint', hint: 'a' })
    expect(state.hintsUsed).toBe(1)
    expect(run(state, { type: 'hint', hint: 'b' }).hintsUsed).toBe(2)
    expect(run(state, enter(1, 2)).hint).toBeNull()
    expect(run(game(), { type: 'solver-started' }).solverUsed).toBe(true)
    expect(run(game(), { type: 'enter', cell: 1, digit: 2, bySolver: true }).solverUsed).toBe(true)
  })
})

describe('saving progress', () => {
  it('packs moves into numbers and back', () => {
    for (const move of [
      { cell: 0, digit: 0, note: false },
      { cell: 35, digit: 6, note: true },
      { cell: 80, digit: 9, note: false },
    ]) {
      expect(unpackMove(packMove(move))).toEqual(move)
    }
  })

  it('replays saved moves', () => {
    const played = run(game(), enter(1, 3), enter(1, 2), enter(2, 4, true), enter(4, 3), { type: 'undo' })
    const restored = restoreProgress(game(), played)
    expect(restored?.values).toEqual(played.values)
    expect(restored?.notes).toEqual(played.notes)
    expect(restored?.future).toEqual(played.future)
    expect(restored?.mistakes).toBe(1)
    expect(restored?.status).toBe('playing')
  })

  it('refuses moves that do not replay, and finished games', () => {
    const progress = { history: [], future: [], mistakes: 0, hintsUsed: 0, solverUsed: false }
    expect(restoreProgress(game(), progress)?.status).toBe('ready')
    expect(restoreProgress(game(), { ...progress, history: [{ cell: 0, digit: 2, note: false }] })).toBeNull()
    expect(restoreProgress(game(), { ...progress, future: [{ cell: 0, digit: 2, note: false }] })).toBeNull()
    const finished = BLANKS.map((cell) => ({ cell, digit: SOLUTION[cell], note: false }))
    expect(restoreProgress(game(), { ...progress, history: finished })).toBeNull()
  })
})
