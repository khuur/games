import { describe, expect, it } from 'vitest'
import {
  canPour,
  countComplete,
  generatePuzzle,
  isComplete,
  isSolved,
  legalPours,
  MAX_COLORS,
  minimumDifficulty,
  MIN_COLORS,
  pour,
  pourAmount,
  solve,
  topRun,
  type Pour,
  type Tubes,
} from './waterSort'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function play(tubes: Tubes, moves: Pour[]): Tubes {
  return moves.reduce<Tubes>((current, move) => {
    expect(canPour(current, move)).toBe(true)
    return pour(current, move)
  }, tubes)
}

/** Fewest pours by plain breadth-first search over every legal pour, as an independent check. */
function fewestPours(start: Tubes): number | null {
  const key = (tubes: Tubes) => tubes.map((tube) => tube.join(',')).sort().join('|')
  const seen = new Set([key(start)])
  let frontier: Tubes[] = [start]
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: Tubes[] = []
    for (const tubes of frontier) {
      if (isSolved(tubes)) return depth
      for (const move of legalPours(tubes)) {
        const after = pour(tubes, move)
        if (seen.has(key(after))) continue
        seen.add(key(after))
        next.push(after)
      }
    }
    frontier = next
  }
  return null
}

describe('rules', () => {
  it('pours the top colour onto an empty tube or the same colour', () => {
    const tubes: Tubes = [[0, 1, 1], [2, 1], [], [0, 0, 2, 2]]
    expect(pourAmount(tubes, { from: 0, to: 1 })).toBe(2)
    expect(pour(tubes, { from: 0, to: 1 })).toEqual([[0], [2, 1, 1, 1], [], [0, 0, 2, 2]])
    expect(pourAmount(tubes, { from: 0, to: 2 })).toBe(2)
    expect(pourAmount(tubes, { from: 0, to: 3 })).toBe(0)
    expect(pourAmount(tubes, { from: 2, to: 0 })).toBe(0)
    expect(pourAmount(tubes, { from: 1, to: 1 })).toBe(0)
  })

  it('only pours as much as fits', () => {
    const tubes: Tubes = [[1, 1, 1], [0, 0, 1]]
    expect(pourAmount(tubes, { from: 0, to: 1 })).toBe(1)
    expect(pour(tubes, { from: 0, to: 1 })).toEqual([[1, 1], [0, 0, 1, 1]])
  })

  it('knows finished tubes and a solved puzzle', () => {
    expect(isComplete([3, 3, 3, 3])).toBe(true)
    expect(isComplete([3, 3, 3])).toBe(false)
    expect(isSolved([[1, 1, 1, 1], [], [0, 0, 0, 0]])).toBe(true)
    expect(isSolved([[1, 1, 1], [1], [0, 0, 0, 0]])).toBe(false)
    expect(countComplete([[1, 1, 1, 1], [0, 0], [2, 2, 2, 2]])).toBe(2)
    expect(topRun([0, 2, 2])).toBe(2)
  })
})

describe('solver', () => {
  it('finds the fewest pours, checked by breadth-first search', () => {
    const random = seededRandom(5)
    for (const colors of [3, 4]) {
      for (let round = 0; round < 12; round++) {
        const { tubes, minimum } = generatePuzzle(colors, random)
        const moves = solve(tubes)!
        expect(isSolved(play(tubes, moves))).toBe(true)
        expect(moves).toHaveLength(fewestPours(tubes)!)
        expect(minimum).toBe(moves.length)
      }
    }
  })

  it('reports a puzzle with no way out', () => {
    expect(solve([[0, 1, 0, 1], [1, 0, 1, 0]])).toBeNull()
  })

  it('needs nothing for a solved puzzle', () => {
    expect(solve([[0, 0, 0, 0], []])).toEqual([])
  })
})

describe('generatePuzzle', () => {
  it('deals solvable puzzles with every colour four times and two spare tubes', () => {
    const random = seededRandom(9)
    for (let colors = MIN_COLORS; colors <= MAX_COLORS; colors += 2) {
      const { tubes, minimum } = generatePuzzle(colors, random)
      expect(tubes).toHaveLength(colors + 2)
      expect(tubes.filter((tube) => tube.length === 0)).toHaveLength(2)
      for (let color = 0; color < colors; color++) {
        expect(tubes.flat().filter((layer) => layer === color)).toHaveLength(4)
      }
      expect(tubes.some(isComplete)).toBe(false)
      expect(minimum).toBeGreaterThanOrEqual(minimumDifficulty(colors))
      expect(solve(tubes)).toHaveLength(minimum)
    }
  })
})
