import { describe, expect, it } from 'vitest'
import {
  createPuzzle,
  lightsOutReducer,
  restorePuzzle,
  toSnapshot,
  type LightsOutAction,
  type LightsOutState,
} from './gameState'
import { press, solve } from './lightsOut'

const run = (state: LightsOutState, ...actions: LightsOutAction[]) => actions.reduce(lightsOutReducer, state)
const tap = (cell: number): LightsOutAction => ({ type: 'press', cell })

/** A 3×3 puzzle made by pressing the centre and a corner, so it is solved by pressing them again. */
const START = press(press(new Array<boolean>(9).fill(false), 4, 3), 0, 3)
const puzzle = () => createPuzzle(3, START)

describe('lightsOutReducer', () => {
  it('knows the fewest presses for the puzzle', () => {
    expect(puzzle().minimum).toBe(2)
    expect(puzzle().status).toBe('ready')
  })

  it('presses lights and wins on a dark board', () => {
    const won = run(puzzle(), tap(4), tap(0))
    expect(won.status).toBe('won')
    expect(won.history).toEqual([4, 0])
    expect(won.lights.every((on) => !on)).toBe(true)
    expect(run(won, tap(3))).toBe(won)
  })

  it('remembers where the latest press happened', () => {
    expect(run(puzzle(), tap(7)).lastCell).toBe(7)
    expect(run(puzzle(), tap(7), tap(2), { type: 'undo' }).lastCell).toBe(2)
  })

  it('undoes and redoes presses', () => {
    const played = run(puzzle(), tap(1), tap(5))
    const undone = run(played, { type: 'undo' }, { type: 'undo' })
    expect(undone.lights).toEqual(START)
    expect(undone.history).toEqual([])
    expect(undone.undosUsed).toBe(2)
    expect(undone.status).toBe('playing')
    const redone = run(undone, { type: 'redo' }, { type: 'redo' })
    expect(redone.lights).toEqual(played.lights)
    expect(redone.future).toEqual([])
  })

  it('drops the redo stack after a new press', () => {
    const state = run(puzzle(), tap(1), { type: 'undo' }, tap(2))
    expect(state.future).toEqual([])
  })

  it('restarts the same puzzle', () => {
    const restarted = run(puzzle(), tap(1), tap(2), { type: 'hint' }, { type: 'restart' })
    expect(restarted.lights).toEqual(START)
    expect(restarted.history).toEqual([])
    expect(restarted.hintsUsed).toBe(0)
    expect(restarted.gameId).toBe(1)
  })

  it('hints a press from the shortest solution and counts it once', () => {
    const hinted = run(puzzle(), { type: 'hint' }, { type: 'hint' })
    expect(solve(START, 3)).toContain(hinted.hint)
    expect(hinted.hintsUsed).toBe(1)
    expect(run(hinted, tap(8)).hint).toBeNull()
  })

  it('deals a new puzzle with a fresh id', () => {
    const next = press(new Array<boolean>(16).fill(false), 5, 4)
    const state = run(puzzle(), tap(1), { type: 'new-puzzle', size: 4, start: next })
    expect(state.size).toBe(4)
    expect(state.lights).toEqual(next)
    expect(state.minimum).toBe(1)
    expect(state.gameId).toBe(1)
  })

  it('remembers that the solver helped', () => {
    expect(run(puzzle(), { type: 'solver-started' }).solverUsed).toBe(true)
    expect(run(puzzle(), { type: 'press', cell: 4, bySolver: true }).solverUsed).toBe(true)
  })
})

describe('restorePuzzle', () => {
  it('rebuilds a puzzle from its snapshot', () => {
    const played = run(puzzle(), tap(1), tap(2), { type: 'undo' }, { type: 'hint' })
    const restored = restorePuzzle(toSnapshot(played))!
    expect(restored.lights).toEqual(played.lights)
    expect(restored.history).toEqual(played.history)
    expect(restored.future).toEqual(played.future)
    expect(restored.hintsUsed).toBe(1)
    expect(restored.status).toBe('playing')
  })

  it('keeps a puzzle that has not been touched yet', () => {
    expect(restorePuzzle(toSnapshot(puzzle()))!.status).toBe('ready')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(puzzle(), tap(1)))
    expect(restorePuzzle({ ...snapshot, size: 12 })).toBeNull()
    expect(restorePuzzle({ ...snapshot, start: START.slice(1) })).toBeNull()
    expect(restorePuzzle({ ...snapshot, history: [9] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, history: [4, 0] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, start: new Array<boolean>(9).fill(false), history: [] })).toBeNull()
  })
})
