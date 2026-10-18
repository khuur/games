import { beforeEach, describe, expect, it } from 'vitest'
import {
  advise,
  applyJump,
  BOARDS,
  countPegs,
  forgetSearches,
  isLegal,
  legalJumps,
  Outcome,
  solve,
  startingPegs,
  type BoardDefinition,
  type Pegs,
} from './pegSolitaire'

function play(board: BoardDefinition, pegs: Pegs, jumps: { from: number; over: number; to: number }[]): Pegs {
  return jumps.reduce<Pegs>((current, jump) => {
    expect(isLegal(board, current, jump)).toBe(true)
    return applyJump(current, jump)
  }, pegs)
}

/** Best outcome by exhaustive search with no tricks, as an independent check on the small board. */
function bestOutcome(board: BoardDefinition, pegs: Pegs, cache = new Map<string, number>()): number {
  if (countPegs(pegs) === 1) return pegs[board.goalHole] ? Outcome.Perfect : Outcome.OnePeg
  const key = pegs.map(Number).join('')
  const known = cache.get(key)
  if (known !== undefined) return known
  let best: number = Outcome.Hopeless
  for (const jump of legalJumps(board, pegs)) best = Math.max(best, bestOutcome(board, applyJump(pegs, jump), cache))
  cache.set(key, best)
  return best
}

beforeEach(() => forgetSearches())

describe('boards', () => {
  it('has the classic shapes', () => {
    expect(BOARDS.english.holes).toHaveLength(33)
    expect(BOARDS.triangle.holes).toHaveLength(15)
    expect(countPegs(startingPegs(BOARDS.english))).toBe(32)
    expect(countPegs(startingPegs(BOARDS.triangle))).toBe(14)
  })

  it('maps every jump onto a jump under each symmetry', () => {
    for (const board of Object.values(BOARDS)) {
      for (const map of board.symmetries) {
        expect(new Set(map).size).toBe(map.length)
        board.jumps.forEach((jumps, from) => {
          for (const [over, to] of jumps) {
            expect(board.jumps[map[from]]).toContainEqual([map[over], map[to]])
          }
        })
      }
    }
  })

  it('offers the opening jumps into the empty centre', () => {
    const jumps = legalJumps(BOARDS.english, startingPegs(BOARDS.english))
    expect(jumps).toHaveLength(4)
    expect(jumps.every((jump) => jump.to === BOARDS.english.goalHole)).toBe(true)
    expect(legalJumps(BOARDS.triangle, startingPegs(BOARDS.triangle))).toHaveLength(2)
  })
})

describe('solver', () => {
  it.each(['english', 'triangle'] as const)('finishes the %s board with one peg in the goal hole', (id) => {
    const board = BOARDS[id]
    const jumps = solve(board, startingPegs(board))!
    const end = play(board, startingPegs(board), jumps)
    expect(countPegs(end)).toBe(1)
    expect(end[board.goalHole]).toBe(true)
    expect(jumps).toHaveLength(board.holes.length - 2)
  })

  it('agrees with a plain exhaustive search on every triangle position it reaches', () => {
    const board = BOARDS.triangle
    const seen = new Set<string>()
    const visit = (pegs: Pegs) => {
      const key = pegs.map(Number).join('')
      if (seen.has(key)) return
      seen.add(key)
      const advice = advise(board, pegs)!
      expect(advice.outcome).toBe(bestOutcome(board, pegs))
      if (advice.jump) expect(bestOutcome(board, applyJump(pegs, advice.jump))).toBe(advice.outcome)
      for (const jump of legalJumps(board, pegs)) visit(applyJump(pegs, jump))
    }
    visit(startingPegs(board))
    expect(seen.size).toBeGreaterThan(1000)
  })

  it('recognises a hopeless position', () => {
    const board = BOARDS.english
    // Two pegs far apart can never meet.
    const pegs = board.holes.map((_, hole) => hole === 0 || hole === 32)
    expect(advise(board, pegs)).toEqual({ jump: null, outcome: Outcome.Hopeless })
    expect(solve(board, pegs)).toBeNull()
  })

  it('gives up rather than search past its limit', () => {
    // Finishing takes 31 jumps, so a limit of 10 new positions cannot be enough.
    expect(advise(BOARDS.english, startingPegs(BOARDS.english), 10)).toBeNull()
    expect(advise(BOARDS.english, startingPegs(BOARDS.english))?.outcome).toBe(Outcome.Perfect)
  })
})
