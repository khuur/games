import { describe, expect, it } from 'vitest'
import {
  createPuzzle,
  restorePuzzle,
  toSnapshot,
  waterSortReducer,
  type WaterSortAction,
  type WaterSortState,
} from './gameState'
import type { Tube } from './waterSort'

const run = (state: WaterSortState, ...actions: WaterSortAction[]) => actions.reduce(waterSortReducer, state)
const pourAction = (from: number, to: number): WaterSortAction => ({ type: 'pour', move: { from, to } })

/** A three-colour puzzle with two spare tubes. */
const START: Tube[] = [
  [0, 1, 2, 1],
  [2, 0, 1, 2],
  [1, 2, 0, 0],
  [],
  [],
]
const puzzle = () => createPuzzle(3, START, 7)

describe('waterSortReducer', () => {
  it('pours and remembers the pour for the animation', () => {
    const state = run(puzzle(), pourAction(0, 3))
    expect(state.tubes[0]).toEqual([0, 1, 2])
    expect(state.tubes[3]).toEqual([1])
    expect(state.lastPour).toEqual({ from: 0, to: 3, amount: 1, id: 1 })
    expect(state.status).toBe('playing')
  })

  it('ignores impossible pours', () => {
    const state = puzzle()
    expect(run(state, pourAction(0, 1))).toBe(state)
    expect(run(state, pourAction(3, 0))).toBe(state)
  })

  it('selects only tubes with water in them', () => {
    expect(run(puzzle(), { type: 'select', tube: 3 }).selected).toBeNull()
    const selected = run(puzzle(), { type: 'select', tube: 2 })
    expect(selected.selected).toBe(2)
    expect(run(selected, pourAction(2, 3)).selected).toBeNull()
  })

  it('undoes exactly, even where pouring back would move more', () => {
    // Tube 2 has two 0s on top; pour them out, then pour another 0 on top of the spare.
    const played = run(puzzle(), pourAction(2, 3))
    expect(played.tubes[3]).toEqual([0, 0])
    const undone = run(played, { type: 'undo' })
    expect(undone.tubes).toEqual(START)
    expect(undone.future).toEqual([{ from: 2, to: 3 }])
    const redone = run(undone, { type: 'redo' })
    expect(redone.tubes).toEqual(played.tubes)
  })

  it('notices when no pour is possible, and undo gets out of it', () => {
    // After 0→2 every tube but the first is full, and nothing matches its new top colour.
    const almostStuck = createPuzzle(3, [[0, 0, 1, 0], [2, 2, 2, 2], [0, 1, 0]], 1)
    const stuck = run(almostStuck, pourAction(0, 2))
    expect(stuck.tubes).toEqual([[0, 0, 1], [2, 2, 2, 2], [0, 1, 0, 0]])
    expect(stuck.status).toBe('stuck')
    expect(run(stuck, { type: 'undo' }).status).toBe('playing')
  })

  it('wins when every colour has its own tube', () => {
    const almost = createPuzzle(2, [[0, 0, 0], [1, 1, 1, 1], [0], []], 1)
    const won = run(almost, pourAction(2, 0))
    expect(won.status).toBe('won')
    expect(run(won, { type: 'undo' })).toBe(won)
  })

  it('counts each revealed hint once and clears it after a pour', () => {
    const hinted = run(puzzle(), { type: 'hint', move: { from: 2, to: 3 } }, { type: 'hint', move: { from: 2, to: 3 } })
    expect(hinted.hint).toEqual({ from: 2, to: 3 })
    expect(hinted.hintsUsed).toBe(1)
    expect(run(hinted, pourAction(2, 3)).hint).toBeNull()
  })

  it('restarts the same puzzle with a fresh id', () => {
    const restarted = run(puzzle(), pourAction(2, 3), { type: 'restart' })
    expect(restarted.tubes).toEqual(START)
    expect(restarted.history).toEqual([])
    expect(restarted.gameId).toBe(1)
  })
})

describe('restorePuzzle', () => {
  it('rebuilds a puzzle from its snapshot', () => {
    const played = run(puzzle(), pourAction(2, 3), pourAction(0, 4), { type: 'undo' })
    const restored = restorePuzzle(toSnapshot(played))!
    expect(restored.tubes).toEqual(played.tubes)
    expect(restored.future).toEqual([{ from: 0, to: 4 }])
    expect(restored.minimum).toBe(7)
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(puzzle())
    expect(restorePuzzle({ ...snapshot, colors: 4 })).toBeNull()
    expect(restorePuzzle({ ...snapshot, start: [[0, 0, 0, 0], ...START.slice(1)] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, history: [{ from: 0, to: 1 }] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, minimum: 0 })).toBeNull()
  })
})
