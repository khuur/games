import { describe, expect, it } from 'vitest'
import {
  canPlace,
  codeBreakerReducer,
  createGame,
  restoreGame,
  toSnapshot,
  type CodeBreakerAction,
  type CodeBreakerState,
} from './gameState'

const run = (state: CodeBreakerState, ...actions: CodeBreakerAction[]) => actions.reduce(codeBreakerReducer, state)
const place = (color: number): CodeBreakerAction => ({ type: 'place', color })
const guess = (...colors: number[]): CodeBreakerAction[] => [...colors.map(place), { type: 'submit' }]

const classic = () => createGame('classic', [1, 2, 3, 4])
const easy = () => createGame('easy', [0, 1, 2, 3])

describe('codeBreakerReducer', () => {
  it('fills the row slot by slot and starts the game', () => {
    const state = run(classic(), place(5), place(5))
    expect(state.row).toEqual([5, 5, null, null])
    expect(state.cursor).toBe(2)
    expect(state.status).toBe('playing')
  })

  it('moves on to the next empty slot after replacing one', () => {
    const state = run(classic(), place(0), place(1), place(2), { type: 'select', slot: 0 }, place(5))
    expect(state.row).toEqual([5, 1, 2, null])
    expect(state.cursor).toBe(3)
    expect(run(state, place(4), place(3)).row).toEqual([5, 1, 2, 3])
  })

  it('erases backwards like a backspace', () => {
    const state = run(classic(), place(0), place(1), { type: 'erase' })
    expect(state.row).toEqual([0, null, null, null])
    expect(state.cursor).toBe(1)
    expect(run(state, { type: 'erase' }, { type: 'erase' }).row).toEqual([null, null, null, null])
  })

  it('clears a chosen slot', () => {
    const state = run(classic(), place(0), place(1), place(2), { type: 'clear', slot: 1 })
    expect(state.row).toEqual([0, null, 2, null])
    expect(state.cursor).toBe(1)
  })

  it('keeps colours unique on levels without repeats', () => {
    const state = run(easy(), place(4))
    expect(canPlace(state, 4)).toBe(false)
    expect(run(state, place(4))).toBe(state)
    expect(canPlace(state, 4, 0)).toBe(true)
    expect(run(classic(), place(4), place(4)).row).toEqual([4, 4, null, null])
  })

  it('only checks complete rows, and marks them', () => {
    const half = run(classic(), place(1), place(1))
    expect(run(half, { type: 'submit' })).toBe(half)
    const state = run(classic(), ...guess(1, 1, 4, 3))
    expect(state.guesses).toEqual([{ code: [1, 1, 4, 3], feedback: { exact: 1, near: 2 } }])
    expect(state.row).toEqual([null, null, null, null])
    expect(state.cursor).toBe(0)
  })

  it('wins on the right code and then ignores moves', () => {
    const won = run(classic(), ...guess(0, 0, 0, 0), ...guess(1, 2, 3, 4))
    expect(won.status).toBe('won')
    expect(won.guesses).toHaveLength(2)
    expect(run(won, place(1))).toBe(won)
    expect(run(won, { type: 'give-up' })).toBe(won)
  })

  it('loses after the last guess misses', () => {
    let state = classic()
    for (let i = 0; i < 9; i++) state = run(state, ...guess(0, 0, 0, 0))
    expect(state.status).toBe('playing')
    state = run(state, ...guess(5, 5, 5, 5))
    expect(state.status).toBe('lost')
    expect(state.guesses).toHaveLength(10)
  })

  it('gives up on request', () => {
    expect(run(classic(), ...guess(0, 0, 0, 0), { type: 'give-up' }).status).toBe('lost')
  })

  it('puts a hinted guess in the row and counts it once', () => {
    const hinted = run(classic(), place(3), { type: 'hint', code: [0, 0, 1, 1] }, { type: 'hint', code: [0, 0, 1, 1] })
    expect(hinted.row).toEqual([0, 0, 1, 1])
    expect(hinted.hinted).toBe(true)
    expect(hinted.hintsUsed).toBe(1)
    const changed = run(hinted, place(2))
    expect(changed.hinted).toBe(false)
    expect(run(changed, { type: 'hint', code: [0, 0, 1, 1] }).hintsUsed).toBe(2)
    expect(run(easy(), { type: 'hint', code: [0, 0, 1, 1] }).hintsUsed).toBe(0)
  })

  it('clears the row for the solver and remembers it helped', () => {
    const state = run(classic(), place(3), { type: 'solver-started' })
    expect(state.row).toEqual([null, null, null, null])
    expect(state.solverUsed).toBe(true)
    expect(run(classic(), { type: 'place', color: 1, slot: 2, bySolver: true }).solverUsed).toBe(true)
  })

  it('starts a new game with a fresh id', () => {
    const state = run(classic(), place(1), { type: 'new-game', levelId: 'hard', secret: [7, 6, 5, 4, 3] })
    expect(state.levelId).toBe('hard')
    expect(state.row).toHaveLength(5)
    expect(state.guesses).toEqual([])
    expect(state.status).toBe('ready')
    expect(state.gameId).toBe(1)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(classic(), ...guess(0, 0, 1, 1), ...guess(2, 2, 3, 3), place(4), { type: 'hint', code: [1, 2, 3, 5] })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.guesses).toEqual(played.guesses)
    expect(restored.row).toEqual(played.row)
    expect(restored.hintsUsed).toBe(1)
    expect(restored.status).toBe('playing')
  })

  it('keeps a game that has not been touched yet', () => {
    expect(restoreGame(toSnapshot(classic()))!.status).toBe('ready')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(classic(), ...guess(0, 0, 1, 1)))
    expect(restoreGame({ ...snapshot, levelId: 'expert' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, secret: [1, 2, 3] })).toBeNull()
    expect(restoreGame({ ...snapshot, guesses: [[0, 0, 1, 9]] })).toBeNull()
    expect(restoreGame({ ...snapshot, guesses: [[1, 2, 3, 4]] })).toBeNull()
    expect(restoreGame({ ...snapshot, guesses: new Array(10).fill([0, 0, 0, 0]) })).toBeNull()
    expect(restoreGame({ ...snapshot, row: [0, null] })).toBeNull()
    expect(restoreGame({ ...toSnapshot(easy()), row: [1, 1, null, null] })).toBeNull()
  })
})
