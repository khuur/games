import { describe, expect, it } from 'vitest'
import { createGame, queensReducer, restoreGame, toSnapshot, type QueensAction, type QueensState } from './gameState'
import { BLANK, CROSS, findHint, generatePuzzle, LEVELS, QUEEN } from './queens'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.easy, seededRandom(7))
const SOLUTION = PUZZLE.solution
/** A cell that is not a queen's. */
const SPARE = Array.from({ length: 36 }, (_, cell) => cell).find((cell) => !SOLUTION.includes(cell))!

const run = (state: QueensState, ...actions: QueensAction[]) => actions.reduce(queensReducer, state)
const queen = (...cells: number[]): QueensAction => ({ type: 'mark', cells, from: BLANK, to: QUEEN })
const cross = (...cells: number[]): QueensAction => ({ type: 'mark', cells, from: BLANK, to: CROSS })
const game = () => createGame('easy', PUZZLE)

describe('queensReducer', () => {
  it('places queens and crosses', () => {
    const state = run(game(), queen(SOLUTION[0]), cross(SPARE))
    expect(state.marks[SOLUTION[0]]).toBe(QUEEN)
    expect(state.marks[SPARE]).toBe(CROSS)
    expect(state.history).toHaveLength(2)
    expect(state.status).toBe('playing')
  })

  it('turns a wrong queen into a red cross and a mistake that undo keeps', () => {
    const state = run(game(), cross(SOLUTION[0]), queen(SPARE))
    expect(state.marks[SPARE]).toBe(CROSS)
    expect(state.wrong[SPARE]).toBe(true)
    expect(state.mistakes).toBe(1)
    expect(state.history).toHaveLength(1)
    const undone = run(state, { type: 'undo' })
    expect(undone.marks[SOLUTION[0]]).toBe(BLANK)
    expect(undone.marks[SPARE]).toBe(CROSS)
    expect(run(undone, { type: 'mark', cells: [SPARE], from: CROSS, to: BLANK })).toBe(undone)
  })

  it('merges one drag into a single move', () => {
    const others = Array.from({ length: 36 }, (_, cell) => cell).filter((cell) => !SOLUTION.includes(cell)).slice(0, 3)
    const state = run(
      game(),
      { type: 'mark', cells: [others[0]], from: BLANK, to: CROSS, stroke: 1 },
      { type: 'mark', cells: [others[1], others[2]], from: BLANK, to: CROSS, stroke: 1 },
    )
    expect(state.history).toHaveLength(1)
    expect(run(state, { type: 'undo' }).marks.filter((mark) => mark === CROSS)).toEqual([])
  })

  it('wins with every queen in place', () => {
    const won = run(game(), queen(...SOLUTION))
    expect(won.status).toBe('won')
    expect(run(won, cross(SPARE))).toBe(won)
  })

  it('undoes and redoes', () => {
    const state = run(game(), queen(SOLUTION[0]), { type: 'undo' })
    expect(state.marks[SOLUTION[0]]).toBe(BLANK)
    expect(run(state, { type: 'redo' }).marks[SOLUTION[0]]).toBe(QUEEN)
    expect(run(state, cross(SPARE)).future).toEqual([])
  })

  it('counts a hint once, and the solver', () => {
    const hint = findHint(6, PUZZLE.regions, SOLUTION, game().marks)!
    const hinted = run(game(), { type: 'hint', hint }, { type: 'hint', hint })
    expect(hinted.hintsUsed).toBe(1)
    const solved = run(game(), { type: 'apply', changes: SOLUTION.map((cell) => ({ cell, to: QUEEN })), bySolver: true })
    expect(solved.status).toBe('won')
    expect(solved.solverUsed).toBe(true)
  })

  it('restarts the same puzzle', () => {
    const state = run(game(), queen(SOLUTION[0]), queen(SPARE), { type: 'restart' })
    expect(state.marks.every((mark) => mark === BLANK)).toBe(true)
    expect(state.mistakes).toBe(0)
    expect(state.gameId).toBe(1)
  })
})

describe('findHint', () => {
  it('points out crosses on queens first', () => {
    const state = run(game(), cross(SOLUTION[2]))
    expect(findHint(6, PUZZLE.regions, SOLUTION, state.marks)).toEqual({ kind: 'wrong-cross', cells: [SOLUTION[2]] })
  })

  it('leads all the way to the solution', () => {
    let state = game()
    for (let guard = 0; guard < 200 && state.status !== 'won'; guard++) {
      const hint = findHint(6, PUZZLE.regions, SOLUTION, state.marks)!
      expect(hint.kind).toBe('step')
      if (hint.kind !== 'step') break
      const changes = [
        ...(hint.step.queen === undefined ? [] : [{ cell: hint.step.queen, to: QUEEN as typeof QUEEN }]),
        ...(hint.step.eliminate ?? []).map((cell) => ({ cell, to: CROSS as typeof CROSS })),
      ]
      state = run(state, { type: 'apply', changes })
    }
    expect(state.status).toBe('won')
    expect(state.mistakes).toBe(0)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(game(), queen(SOLUTION[0]), cross(SPARE), queen(SOLUTION[1]), { type: 'undo' })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.marks).toEqual(played.marks)
    expect(restored.future).toEqual(played.future)
    expect(restored.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(game(), queen(SOLUTION[0])))
    expect(restoreGame({ ...snapshot, levelId: 'huge' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, regions: snapshot.regions.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, marks: snapshot.marks.map((mark, cell) => (cell === SPARE ? QUEEN : mark)) })).toBeNull()
    expect(restoreGame({ ...snapshot, solution: SOLUTION.slice(1) })).toBeNull()
    expect(restoreGame(toSnapshot(run(game(), queen(...SOLUTION))))).toBeNull()
  })
})
