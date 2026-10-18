import { describe, expect, it } from 'vitest'
import { createGame, isLineDone, nonogramReducer, restoreGame, toSnapshot, type NonogramAction, type NonogramState } from './gameState'
import { EMPTY, FILLED, findHint, LEVELS, lineCells, UNKNOWN } from './nonogram'

const level = LEVELS.easy
/** An 8×8 picture: the top row and the left column filled, nothing else. */
const SOLUTION = Array.from({ length: 64 }, (_, cell) => cell < 8 || cell % 8 === 0)

const run = (state: NonogramState, ...actions: NonogramAction[]) => actions.reduce(nonogramReducer, state)
const fill = (...cells: number[]): NonogramAction => ({ type: 'mark', cells, from: UNKNOWN, to: FILLED })
const cross = (...cells: number[]): NonogramAction => ({ type: 'mark', cells, from: UNKNOWN, to: EMPTY })
const game = () => createGame('easy', SOLUTION)

describe('nonogramReducer', () => {
  it('works out the clues', () => {
    const state = game()
    expect(state.clues[0]).toEqual([8])
    expect(state.clues[1]).toEqual([1])
    expect(state.clues[8]).toEqual([8])
    expect(state.clues[9]).toEqual([1])
  })

  it('fills and crosses cells as one move per stroke', () => {
    const state = run(game(), fill(0, 1, 2), cross(9, 10))
    expect(state.cells.slice(0, 3)).toEqual([FILLED, FILLED, FILLED])
    expect(state.cells[9]).toBe(EMPTY)
    expect(state.history).toHaveLength(2)
    expect(state.status).toBe('playing')
  })

  it('only changes cells that match where the stroke started', () => {
    const state = run(game(), cross(1), fill(0, 1, 2))
    expect(state.cells.slice(0, 3)).toEqual([FILLED, EMPTY, FILLED])
    const erased = run(state, { type: 'mark', cells: [0, 1, 2], from: FILLED, to: UNKNOWN })
    expect(erased.cells.slice(0, 3)).toEqual([UNKNOWN, EMPTY, UNKNOWN])
  })

  it('turns a wrong fill into a red cross and a mistake that undo keeps', () => {
    const state = run(game(), fill(0, 9))
    expect(state.cells[9]).toBe(EMPTY)
    expect(state.wrong[9]).toBe(true)
    expect(state.mistakes).toBe(1)
    const undone = run(state, { type: 'undo' })
    expect(undone.cells[0]).toBe(UNKNOWN)
    expect(undone.cells[9]).toBe(EMPTY)
    expect(undone.mistakes).toBe(1)
    // The red cross can't be changed.
    expect(run(undone, { type: 'mark', cells: [9], from: EMPTY, to: UNKNOWN })).toBe(undone)
  })

  it('counts a lone wrong fill without adding a move', () => {
    const state = run(game(), fill(10))
    expect(state.mistakes).toBe(1)
    expect(state.history).toEqual([])
  })

  it('undoes and redoes strokes', () => {
    const state = run(game(), fill(0, 1), cross(9), { type: 'undo' })
    expect(state.cells[9]).toBe(UNKNOWN)
    expect(state.future).toHaveLength(1)
    expect(run(state, { type: 'redo' }).cells[9]).toBe(EMPTY)
    expect(run(state, fill(2)).future).toEqual([])
  })

  it('wins once every picture cell is filled, crossing out the rest', () => {
    const picture = SOLUTION.flatMap((filled, cell) => (filled ? [cell] : []))
    const won = run(game(), fill(...picture))
    expect(won.status).toBe('won')
    expect(won.cells.filter((mark) => mark === UNKNOWN)).toEqual([])
    expect(run(won, { type: 'undo' })).toBe(won)
  })

  it('knows when a line is done', () => {
    const state = run(game(), fill(0, 1, 2, 3, 4, 5, 6))
    expect(isLineDone(state, lineCells(level, 0))).toBe(false)
    expect(isLineDone(run(state, fill(7)), lineCells(level, 0))).toBe(true)
  })

  it('applies the solver’s changes and remembers it helped', () => {
    const state = run(game(), {
      type: 'apply',
      changes: [
        { cell: 0, to: FILLED },
        { cell: 9, to: EMPTY },
      ],
      bySolver: true,
    })
    expect(state.cells[0]).toBe(FILLED)
    expect(state.cells[9]).toBe(EMPTY)
    expect(state.solverUsed).toBe(true)
  })

  it('counts a hint once', () => {
    const hint = findHint(level, game().clues, SOLUTION, game().cells)!
    const state = run(game(), { type: 'hint', hint }, { type: 'hint', hint })
    expect(state.hintsUsed).toBe(1)
    expect(run(state, fill(0)).hint).toBeNull()
  })

  it('restarts the same picture', () => {
    const state = run(game(), fill(0, 9), { type: 'restart' })
    expect(state.cells.every((mark) => mark === UNKNOWN)).toBe(true)
    expect(state.mistakes).toBe(0)
    expect(state.gameId).toBe(1)
  })
})

describe('findHint', () => {
  it('points out crosses on picture cells first', () => {
    const state = run(game(), cross(0, 9))
    expect(findHint(level, state.clues, SOLUTION, state.cells)).toEqual({ kind: 'wrong-cross', cells: [0] })
  })

  it('names the line that proves the most', () => {
    const hint = findHint(level, game().clues, SOLUTION, game().cells)!
    expect(hint.kind).toBe('line')
    if (hint.kind !== 'line') return
    // The full top row and the full left column each settle all 8 of their cells; the row comes first.
    expect(hint.line).toBe(0)
    expect(hint.states.every((mark) => mark === FILLED)).toBe(true)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(game(), fill(0, 1), cross(9), fill(10), { type: 'undo' })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.cells).toEqual(played.cells)
    expect(restored.wrong).toEqual(played.wrong)
    expect(restored.future).toEqual(played.future)
    expect(restored.mistakes).toBe(1)
    expect(restored.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(game(), fill(0)))
    expect(restoreGame({ ...snapshot, levelId: 'huge' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, cells: snapshot.cells.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, cells: snapshot.cells.map((mark, cell) => (cell === 9 ? FILLED : mark)) })).toBeNull()
    expect(restoreGame({ ...snapshot, wrong: snapshot.wrong.map((_, cell) => cell === 0) })).toBeNull()
    const finished = toSnapshot(run(game(), fill(...SOLUTION.flatMap((filled, cell) => (filled ? [cell] : [])))))
    expect(restoreGame(finished)).toBeNull()
  })
})
