import { describe, expect, it } from 'vitest'
import { solvedTiles, slide } from './fifteen'
import {
  createPuzzle,
  fifteenReducer,
  restorePuzzle,
  toSnapshot,
  type FifteenAction,
  type FifteenState,
} from './gameState'

const run = (state: FifteenState, ...actions: FifteenAction[]) => actions.reduce(fifteenReducer, state)
const tap = (...tiles: number[]): FifteenAction => ({ type: 'slide', tiles })

/** Two slides away from solved: 6 and then 5 moved into the gap. */
const START = slide(slide(solvedTiles(3), 6), 5)
const puzzle = () => createPuzzle(3, START, 2)

describe('fifteenReducer', () => {
  it('slides tiles and wins when they are in order', () => {
    const won = run(puzzle(), tap(5), tap(6))
    expect(won.status).toBe('won')
    expect(won.tiles).toEqual(solvedTiles(3))
    expect(won.history).toEqual([5, 6])
    expect(run(won, tap(6))).toBe(won)
  })

  it('ignores tiles that cannot slide', () => {
    const state = puzzle()
    expect(run(state, tap(1))).toBe(state)
  })

  it('slides a line of tiles in one tap, counting each tile', () => {
    const state = run(createPuzzle(3, solvedTiles(3).map((tile) => (tile === 0 ? 7 : tile === 7 ? 0 : tile)), 99), tap(8))
    expect(state.history).toEqual([8])
    const line = run(createPuzzle(3, [1, 2, 3, 4, 5, 6, 0, 7, 8], 2), tap(7, 8))
    expect(line.history).toEqual([7, 8])
    expect(line.status).toBe('won')
  })

  it('undoes and redoes single slides', () => {
    const played = run(puzzle(), tap(5))
    const undone = run(played, { type: 'undo' })
    expect(undone.tiles).toEqual(START)
    expect(undone.undosUsed).toBe(1)
    const redone = run(undone, { type: 'redo' })
    expect(redone.tiles).toEqual(played.tiles)
  })

  it('restarts the same puzzle with a fresh id', () => {
    const restarted = run(puzzle(), tap(5), { type: 'restart' })
    expect(restarted.tiles).toEqual(START)
    expect(restarted.history).toEqual([])
    expect(restarted.gameId).toBe(1)
  })

  it('shows a hint only for a tile that can move, counting it once', () => {
    const hinted = run(puzzle(), { type: 'hint', tile: 5 }, { type: 'hint', tile: 5 })
    expect(hinted.hint).toBe(5)
    expect(hinted.hintsUsed).toBe(1)
    expect(run(puzzle(), { type: 'hint', tile: 1 }).hint).toBeNull()
    expect(run(hinted, tap(5)).hint).toBeNull()
  })
})

describe('restorePuzzle', () => {
  it('rebuilds a puzzle from its snapshot', () => {
    const played = run(puzzle(), tap(5), { type: 'undo' }, { type: 'hint', tile: 5 })
    const restored = restorePuzzle(toSnapshot(played))!
    expect(restored.tiles).toEqual(played.tiles)
    expect(restored.future).toEqual([5])
    expect(restored.target).toBe(2)
    expect(restored.hintsUsed).toBe(1)
  })

  it('rejects impossible, corrupt or finished puzzles', () => {
    const snapshot = toSnapshot(puzzle())
    const swapped = [...START]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(restorePuzzle({ ...snapshot, start: swapped })).toBeNull()
    expect(restorePuzzle({ ...snapshot, start: [1, 1, 2, 3, 4, 5, 6, 7, 0] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, history: [1] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, history: [5, 6] })).toBeNull()
    expect(restorePuzzle({ ...snapshot, size: 9 })).toBeNull()
  })
})
