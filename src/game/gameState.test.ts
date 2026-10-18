import { describe, expect, it } from 'vitest'
import { createGame, gameReducer, restoreGame, toSnapshot, type GameAction, type GameState } from './gameState'
import { solve } from './hanoi'

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state)
const move = (from: number, to: number): GameAction => ({ type: 'move', move: { from, to } })

describe('gameReducer', () => {
  it('plays moves and wins on the goal tower', () => {
    const start = createGame(3)
    const won = run(start, ...solve(start.towers).map(({ from, to }) => move(from, to)))
    expect(won.status).toBe('won')
    expect(won.history).toHaveLength(7)
    expect(won.towers).toEqual([[], [], [3, 2, 1]])
  })

  it('ignores illegal moves', () => {
    const state = run(createGame(3), move(0, 1))
    expect(run(state, move(0, 1))).toBe(state)
    expect(run(state, move(2, 0))).toBe(state)
  })

  it('selects only towers with disks and clears the selection after a move', () => {
    const start = createGame(3)
    expect(run(start, { type: 'select', tower: 1 })).toBe(start)
    const selected = run(start, { type: 'select', tower: 0 })
    expect(selected.selected).toBe(0)
    expect(run(selected, move(0, 2)).selected).toBeNull()
    expect(run(selected, { type: 'deselect' }).selected).toBeNull()
  })

  it('undoes and redoes moves', () => {
    const played = run(createGame(3), move(0, 2), move(0, 1))
    const undone = run(played, { type: 'undo' }, { type: 'undo' })
    expect(undone.towers).toEqual([[3, 2, 1], [], []])
    expect(undone.history).toEqual([])
    expect(undone.undosUsed).toBe(2)
    expect(undone.status).toBe('playing')

    const redone = run(undone, { type: 'redo' }, { type: 'redo' })
    expect(redone.towers).toEqual(played.towers)
    expect(redone.history).toEqual(played.history)
    expect(redone.future).toEqual([])
  })

  it('drops the redo stack when a different move is made', () => {
    const state = run(createGame(3), move(0, 2), { type: 'undo' }, move(0, 1))
    expect(state.future).toEqual([])
    expect(run(state, { type: 'redo' })).toBe(state)
  })

  it('locks the game once it is won', () => {
    const start = createGame(3)
    const won = run(start, ...solve(start.towers).map(({ from, to }) => move(from, to)))
    expect(run(won, { type: 'undo' })).toBe(won)
    expect(run(won, { type: 'select', tower: 2 })).toBe(won)
    expect(run(won, { type: 'hint' })).toBe(won)
  })

  it('counts each revealed hint once', () => {
    const hinted = run(createGame(3), { type: 'hint' }, { type: 'hint' })
    expect(hinted.hint).toEqual({ from: 0, to: 2 })
    expect(hinted.hintsUsed).toBe(1)
    const next = run(hinted, move(0, 2), { type: 'hint' })
    expect(next.hint).toEqual({ from: 0, to: 1 })
    expect(next.hintsUsed).toBe(2)
  })

  it('remembers that the solver helped', () => {
    expect(run(createGame(3), { type: 'solver-started' }).solverUsed).toBe(true)
    expect(run(createGame(3), { type: 'move', move: { from: 0, to: 2 }, bySolver: true }).solverUsed).toBe(true)
  })

  it('starts a new game with a fresh id', () => {
    const state = run(createGame(3), move(0, 2), { type: 'new-game', diskCount: 5 })
    expect(state.gameId).toBe(1)
    expect(state.diskCount).toBe(5)
    expect(state.history).toEqual([])
    expect(state.status).toBe('ready')
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(createGame(4), move(0, 1), move(0, 2), move(1, 2), { type: 'undo' }, { type: 'hint' })
    const restored = restoreGame(toSnapshot(played))
    expect(restored).not.toBeNull()
    expect(restored!.towers).toEqual(played.towers)
    expect(restored!.history).toEqual(played.history)
    expect(restored!.future).toEqual(played.future)
    expect(restored!.hintsUsed).toBe(1)
    expect(restored!.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(createGame(3), move(0, 2)))
    expect(restoreGame({ ...snapshot, history: [{ from: 0, to: 2 }, { from: 0, to: 2 }] })).toBeNull()
    expect(restoreGame({ ...snapshot, history: [{ from: 0, to: 7 }] })).toBeNull()
    expect(restoreGame({ ...snapshot, diskCount: 42 })).toBeNull()
    expect(restoreGame({ ...snapshot, history: [] })).toBeNull()
    const start = createGame(3)
    expect(restoreGame({ ...snapshot, history: solve(start.towers) })).toBeNull()
  })

  it('drops a redo stack that no longer fits', () => {
    const snapshot = toSnapshot(run(createGame(3), move(0, 2)))
    const restored = restoreGame({ ...snapshot, future: [{ from: 1, to: 0 }] })
    expect(restored!.future).toEqual([])
  })
})
