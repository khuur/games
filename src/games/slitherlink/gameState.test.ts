import { describe, expect, it } from 'vitest'
import { createGame, restoreGame, slitherlinkReducer, toSnapshot, type SlitherlinkAction, type SlitherlinkState } from './gameState'
import { CROSS, findHint, generatePuzzle, geometryOf, LEVELS, LINE, UNKNOWN } from './slitherlink'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.easy, seededRandom(21))
const GEOMETRY = geometryOf(5, 5)
const run = (state: SlitherlinkState, ...actions: SlitherlinkAction[]) => actions.reduce(slitherlinkReducer, state)
const set = (edge: number, to: number, stroke?: number): SlitherlinkAction => ({ type: 'set', changes: [{ edge, to: to as 0 | 1 | 2 }], stroke })
const game = () => createGame('easy', PUZZLE)
/** A dot in the middle of the grid, with its four edges. */
const MIDDLE = GEOMETRY.dotEdges[2 * 6 + 2]

describe('slitherlinkReducer', () => {
  it('draws, crosses and clears edges', () => {
    const state = run(game(), set(0, LINE))
    expect(state.edges[0]).toBe(LINE)
    expect(state.status).toBe('playing')
    expect(run(state, set(0, CROSS)).edges[0]).toBe(CROSS)
    expect(run(state, set(0, UNKNOWN)).edges[0]).toBe(UNKNOWN)
    expect(run(state, set(0, LINE))).toBe(state)
  })

  it('counts a move that breaks a rule, once per drag, and keeps it on undo', () => {
    // Three lines at one dot is a branch.
    const branched = run(game(), set(MIDDLE[0], LINE, 1), set(MIDDLE[1], LINE, 1), set(MIDDLE[2], LINE, 1), set(MIDDLE[3], LINE, 1))
    expect(branched.mistakes).toBe(1)
    expect(branched.history).toHaveLength(1)
    const undone = run(branched, { type: 'undo' })
    expect(MIDDLE.every((edge) => undone.edges[edge] === UNKNOWN)).toBe(true)
    expect(undone.mistakes).toBe(1)
    // Separate taps count separately.
    const tapped = run(game(), set(MIDDLE[0], LINE), set(MIDDLE[1], LINE), set(MIDDLE[2], LINE), set(MIDDLE[3], LINE))
    expect(tapped.mistakes).toBe(1)
  })

  it('wins once the loop is drawn, whatever else is left open', () => {
    const changes = PUZZLE.solution.flatMap((state, edge) => (state === LINE ? [{ edge, to: LINE as 1 }] : []))
    const won = run(game(), { type: 'apply', changes })
    expect(won.status).toBe('won')
    expect(won.mistakes).toBe(0)
    expect(run(won, set(0, CROSS))).toBe(won)
  })

  it('counts a hint once while it shows, and notes the solver', () => {
    const hint = findHint(5, 5, PUZZLE.clues, game().edges, PUZZLE.solution)!
    expect(run(game(), { type: 'hint', hint }, { type: 'hint', hint }).hintsUsed).toBe(1)
    expect(run(game(), { type: 'apply', changes: [{ edge: 0, to: CROSS }], bySolver: true }).solverUsed).toBe(true)
  })

  it('restarts and starts new puzzles', () => {
    const played = run(game(), set(0, LINE))
    expect(run(played, { type: 'restart' }).edges.every((edge) => edge === UNKNOWN)).toBe(true)
    const next = generatePuzzle(LEVELS.easy, seededRandom(22))
    expect(run(played, { type: 'new-game', levelId: 'easy', puzzle: next }).clues).toEqual(next.clues)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game in progress', () => {
    const played = run(game(), set(MIDDLE[0], LINE), set(MIDDLE[1], CROSS))
    const restored = restoreGame(toSnapshot(played))
    expect(restored?.edges).toEqual(played.edges)
    expect(restored?.history).toEqual(played.history)
  })

  it('refuses snapshots that do not add up', () => {
    const snapshot = toSnapshot(game())
    expect(restoreGame(snapshot)).not.toBeNull()
    expect(restoreGame({ ...snapshot, levelId: 'hard' })).toBeNull()
    expect(restoreGame({ ...snapshot, clues: snapshot.clues.slice(1) })).toBeNull()
    // A clue the loop doesn't meet, and a loop with a gap.
    const clue = snapshot.clues.findIndex((value) => value >= 0)
    expect(restoreGame({ ...snapshot, clues: snapshot.clues.map((value, cell) => (cell === clue ? (value + 1) % 4 : value)) })).toBeNull()
    const gap = snapshot.solution.indexOf(LINE)
    expect(restoreGame({ ...snapshot, solution: snapshot.solution.map((state, edge) => (edge === gap ? UNKNOWN : state)) })).toBeNull()
    // A finished game.
    expect(restoreGame({ ...snapshot, edges: snapshot.solution.map((state) => (state === LINE ? LINE : UNKNOWN)) })).toBeNull()
  })
})
