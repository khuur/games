import { describe, expect, it } from 'vitest'
import { findHint, generatePuzzle, LEVELS } from './bridges'
import {
  blockersOf,
  bridgesReducer,
  capacityOf,
  createGame,
  layoutOfState,
  restoreGame,
  toSnapshot,
  type BridgesAction,
  type BridgesState,
} from './gameState'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.easy, seededRandom(11))
const run = (state: BridgesState, ...actions: BridgesAction[]) => actions.reduce(bridgesReducer, state)
const game = () => createGame('easy', PUZZLE)
/** A link the solution uses, and one it doesn't. */
const USED = PUZZLE.solution.findIndex((count) => count > 0)
const UNUSED = PUZZLE.solution.findIndex((count) => count === 0)

/** Every move that builds the solution, link by link. */
const solve = (): BridgesAction[] =>
  PUZZLE.solution.flatMap((count, link) => Array.from({ length: count }, (): BridgesAction => ({ type: 'cycle', link })))

describe('bridgesReducer', () => {
  it('cycles a link through one, two and no bridges', () => {
    const link = PUZZLE.solution.findIndex((count, i) => count > 0 && capacityOf(game(), i) === 2)
    if (link < 0) return
    const one = run(game(), { type: 'cycle', link })
    expect(one.counts[link]).toBe(1)
    expect(one.status).toBe('playing')
    expect(run(one, { type: 'cycle', link }).counts[link]).toBe(2)
    expect(run(one, { type: 'cycle', link }, { type: 'cycle', link }).counts[link]).toBe(0)
  })

  it('refuses bridges that would cross', () => {
    const state = game()
    const crossing = layoutOfState(state).crossings.findIndex((crossed) => crossed.length > 0)
    if (crossing < 0) return
    const other = layoutOfState(state).crossings[crossing][0]
    const built = run(state, { type: 'cycle', link: crossing })
    expect(blockersOf(built, other)).toEqual([crossing])
    expect(run(built, { type: 'cycle', link: other })).toBe(built)
  })

  it('wins once every island is full and all are joined', () => {
    const won = run(game(), ...solve())
    expect(won.status).toBe('won')
    expect(won.history).toHaveLength(PUZZLE.solution.reduce((sum, count) => sum + count, 0))
    expect(run(won, { type: 'cycle', link: USED })).toBe(won)
  })

  it('undoes and redoes', () => {
    const state = run(game(), { type: 'cycle', link: USED }, { type: 'undo' })
    expect(state.counts[USED]).toBe(0)
    expect(run(state, { type: 'redo' }).counts[USED]).toBe(1)
    expect(run(state, { type: 'cycle', link: USED }).future).toEqual([])
  })

  it('counts a hint once, and the solver', () => {
    const hint = findHint(layoutOfState(game()), PUZZLE.solution, game().counts)!
    expect(run(game(), { type: 'hint', hint }, { type: 'hint', hint }).hintsUsed).toBe(1)
    expect(run(game(), { type: 'set', link: USED, count: 1, bySolver: true }).solverUsed).toBe(true)
  })

  it('restarts the same puzzle', () => {
    const state = run(game(), { type: 'cycle', link: USED }, { type: 'restart' })
    expect(state.counts.every((count) => count === 0)).toBe(true)
    expect(state.gameId).toBe(1)
  })
})

describe('findHint', () => {
  it('points out a bridge that should not be there', () => {
    if (UNUSED < 0) return
    const state = run(game(), { type: 'cycle', link: UNUSED })
    if (state.counts[UNUSED] === 0) return
    expect(findHint(layoutOfState(state), PUZZLE.solution, state.counts)).toEqual({ kind: 'wrong', link: UNUSED })
  })

  it('leads all the way to the solution', () => {
    let state = game()
    for (let guard = 0; guard < 300 && state.status !== 'won'; guard++) {
      const hint = findHint(layoutOfState(state), PUZZLE.solution, state.counts)!
      expect(hint.kind).toBe('bridge')
      if (hint.kind !== 'bridge') break
      state = run(state, { type: 'set', link: hint.link, count: hint.count })
    }
    expect(state.status).toBe('won')
  })
})

describe('restoreGame', () => {
  it('rebuilds a game from its snapshot', () => {
    const played = run(game(), { type: 'cycle', link: USED }, { type: 'undo' }, { type: 'cycle', link: USED })
    const restored = restoreGame(toSnapshot(played))!
    expect(restored.counts).toEqual(played.counts)
    expect(restored.history).toEqual(played.history)
    expect(restored.status).toBe('playing')
  })

  it('rejects corrupt or finished games', () => {
    const snapshot = toSnapshot(run(game(), { type: 'cycle', link: USED }))
    expect(restoreGame({ ...snapshot, levelId: 'huge' as 'easy' })).toBeNull()
    expect(restoreGame({ ...snapshot, counts: snapshot.counts.slice(1) })).toBeNull()
    expect(restoreGame({ ...snapshot, counts: snapshot.counts.map(() => 3) })).toBeNull()
    expect(restoreGame({ ...snapshot, islands: [] })).toBeNull()
    expect(restoreGame({ ...snapshot, solution: snapshot.solution.map(() => 0) })).toBeNull()
    expect(restoreGame(toSnapshot(run(game(), ...solve())))).toBeNull()
  })
})
