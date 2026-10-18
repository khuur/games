import { describe, expect, it } from 'vitest'
import { createGame, restoreGame, starBattleReducer, toSnapshot, type StarBattleAction, type StarBattleState } from './gameState'
import { BLANK, CROSS, findHint, generatePuzzle, LEVELS, STAR } from './starBattle'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PUZZLE = generatePuzzle(LEVELS.easy, seededRandom(12))
const STAR_CELL = PUZZLE.solution[0]
const EMPTY_CELL = PUZZLE.regions.findIndex((_, cell) => !PUZZLE.solution.includes(cell))
const run = (state: StarBattleState, ...actions: StarBattleAction[]) => actions.reduce(starBattleReducer, state)
const game = () => createGame('easy', PUZZLE)

describe('starBattleReducer', () => {
  it('marks cells and counts a wrong star as a lasting mistake', () => {
    const crossed = run(game(), { type: 'mark', cells: [EMPTY_CELL], from: BLANK, to: CROSS })
    expect(crossed.marks[EMPTY_CELL]).toBe(CROSS)
    expect(crossed.status).toBe('playing')
    const wrong = run(game(), { type: 'mark', cells: [EMPTY_CELL], from: BLANK, to: STAR })
    expect(wrong.marks[EMPTY_CELL]).toBe(CROSS)
    expect(wrong.wrong[EMPTY_CELL]).toBe(true)
    expect(wrong.mistakes).toBe(1)
    expect(wrong.history).toEqual([])
    // A red cross stays put.
    expect(run(wrong, { type: 'mark', cells: [EMPTY_CELL], from: CROSS, to: BLANK })).toBe(wrong)
  })

  it('joins a drag into one move, and undoes it in one go', () => {
    const cells = PUZZLE.regions.flatMap((_, cell) => (PUZZLE.solution.includes(cell) ? [] : [cell])).slice(0, 3)
    const state = run(
      game(),
      { type: 'mark', cells: [cells[0]], from: BLANK, to: CROSS, stroke: 1 },
      { type: 'mark', cells: cells.slice(1), from: BLANK, to: CROSS, stroke: 1 },
    )
    expect(state.history).toHaveLength(1)
    const undone = run(state, { type: 'undo' })
    expect(cells.every((cell) => undone.marks[cell] === BLANK)).toBe(true)
    expect(run(undone, { type: 'redo' }).marks[cells[2]]).toBe(CROSS)
  })

  it('wins once every star is placed', () => {
    const won = run(game(), { type: 'apply', changes: PUZZLE.solution.map((cell) => ({ cell, to: STAR })) })
    expect(won.status).toBe('won')
    expect(run(won, { type: 'undo' })).toBe(won)
  })

  it('counts a hint once while it shows', () => {
    const hint = findHint(9, PUZZLE.regions, PUZZLE.solution, game().marks)!
    expect(run(game(), { type: 'hint', hint }, { type: 'hint', hint }).hintsUsed).toBe(1)
    expect(run(game(), { type: 'solver-started' }).solverUsed).toBe(true)
  })

  it('restarts and starts new puzzles', () => {
    const played = run(game(), { type: 'mark', cells: [STAR_CELL], from: BLANK, to: STAR })
    expect(run(played, { type: 'restart' }).marks.every((mark) => mark === BLANK)).toBe(true)
    const next = generatePuzzle(LEVELS.easy, seededRandom(13))
    expect(run(played, { type: 'new-game', levelId: 'easy', puzzle: next }).regions).toEqual(next.regions)
  })
})

describe('restoreGame', () => {
  it('rebuilds a game in progress', () => {
    const played = run(game(), { type: 'mark', cells: [STAR_CELL], from: BLANK, to: STAR }, { type: 'mark', cells: [EMPTY_CELL], from: BLANK, to: STAR })
    const restored = restoreGame(toSnapshot(played))
    expect(restored?.marks).toEqual(played.marks)
    expect(restored?.wrong).toEqual(played.wrong)
    expect(restored?.mistakes).toBe(1)
  })

  it('refuses snapshots that do not add up', () => {
    const snapshot = toSnapshot(game())
    expect(restoreGame(snapshot)).not.toBeNull()
    expect(restoreGame({ ...snapshot, levelId: 'hard' })).toBeNull()
    expect(restoreGame({ ...snapshot, solution: snapshot.solution.slice(1) })).toBeNull()
    // Stars that touch, or a region left in two pieces.
    expect(restoreGame({ ...snapshot, solution: [0, 1, ...snapshot.solution.slice(2)] })).toBeNull()
    const split = snapshot.regions.map((region, cell) => (cell === 0 ? (region + 1) % 9 : region))
    expect(restoreGame({ ...snapshot, regions: split })).toBeNull()
    // A star where none belongs.
    const marks = snapshot.marks.map((mark, cell) => (cell === EMPTY_CELL ? STAR : mark))
    expect(restoreGame({ ...snapshot, marks })).toBeNull()
  })
})
