import { describe, expect, it } from 'vitest'
import {
  CROSS,
  cluesOf,
  findHint,
  findSolutions,
  generatePuzzle,
  geometryOf,
  isLoopDrawn,
  LEVEL_IDS,
  LEVELS,
  LINE,
  NO_CLUE,
  problemsOf,
  solveLogically,
  UNKNOWN,
  type LevelDefinition,
  type Reason,
} from './slitherlink'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Every single loop on a small grid, by brute force: a loop is the outline of a set of cells in
 * one piece, without holes, that never meets itself at just a corner.
 */
function allLoops(rows: number, cols: number): number[][] {
  const geometry = geometryOf(rows, cols)
  const loops: number[][] = []
  for (let mask = 1; mask < 1 << (rows * cols); mask++) {
    const loop = geometry.edgeCells.map((cells) => (cells.filter((cell) => (mask >> cell) & 1).length === 1 ? LINE : UNKNOWN))
    // One loop: every dot has 0 or 2 lines, and the lines are in one piece.
    if (geometry.dotEdges.some((around) => ![0, 2].includes(around.filter((edge) => loop[edge] === LINE).length))) continue
    const lines = loop.flatMap((state, edge) => (state === LINE ? [edge] : []))
    const seen = new Set([lines[0]])
    const stack = [lines[0]]
    while (stack.length) {
      for (const dot of geometry.edgeDots[stack.pop()!]) {
        for (const next of geometry.dotEdges[dot]) {
          if (loop[next] === LINE && !seen.has(next)) {
            seen.add(next)
            stack.push(next)
          }
        }
      }
    }
    if (seen.size !== lines.length) continue
    loops.push(loop)
  }
  return loops
}

describe('geometry', () => {
  it('numbers edges, dots and cells consistently', () => {
    const geometry = geometryOf(2, 3)
    expect(geometry.horizontal).toBe(9)
    expect(geometry.edgeCount).toBe(17)
    expect(geometry.dotEdges).toHaveLength(12)
    expect(geometry.cellEdges[0]).toEqual([0, 10, 3, 9])
    expect(geometry.cellCorners[0]).toEqual([0, 1, 5, 4])
    expect(geometry.dotEdges[0]).toHaveLength(2)
    expect(geometry.dotEdges[5]).toHaveLength(4)
    expect(geometry.edgeCells[0]).toEqual([0])
    expect(geometry.edgeCells[3]).toEqual([0, 3])
    for (let edge = 0; edge < geometry.edgeCount; edge++) {
      for (const dot of geometry.edgeDots[edge]) expect(geometry.dotEdges[dot]).toContain(edge)
      for (const cell of geometry.edgeCells[edge]) expect(geometry.cellEdges[cell]).toContain(edge)
    }
  })

  it('reads clues off a loop', () => {
    const geometry = geometryOf(2, 2)
    // The loop round the whole grid.
    const loop = geometry.edgeCells.map((cells) => (cells.length === 1 ? LINE : UNKNOWN))
    expect(cluesOf(geometry, loop)).toEqual([2, 2, 2, 2])
  })
})

describe('solving', () => {
  it('counts solutions the same way as brute force', () => {
    const loops = allLoops(4, 4)
    const random = seededRandom(41)
    const level: LevelDefinition = { ...LEVELS.easy, rows: 4, cols: 4 }
    for (let trial = 0; trial < 10; trial++) {
      const { clues } = generatePuzzle(level, random)
      // Every other time, drop a few more clues so that some puzzles allow several loops.
      const fewer = clues.map((clue, cell) => (trial % 2 && cell % 3 === trial % 3 ? NO_CLUE : clue))
      const geometry = geometryOf(4, 4)
      const matching = loops.filter((loop) => cluesOf(geometry, loop).every((clue, cell) => fewer[cell] === NO_CLUE || clue === fewer[cell]))
      expect(findSolutions(4, 4, fewer, 1000)).toHaveLength(matching.length)
    }
  })

  it('only claims a solve when the loop is the only one', () => {
    expect(solveLogically(4, 4, new Array<number>(16).fill(NO_CLUE)).solved).toBe(false)
    const geometry = geometryOf(3, 3)
    const loop = geometry.edgeCells.map((cells) => (cells.length === 1 ? LINE : UNKNOWN))
    expect(solveLogically(3, 3, cluesOf(geometry, loop)).solved).toBe(true)
  })
})

describe('generatePuzzle', () => {
  for (const id of LEVEL_IDS) {
    it(`makes ${id} puzzles with one loop that logic reaches`, () => {
      const level = LEVELS[id]
      const { rows, cols } = level
      const geometry = geometryOf(rows, cols)
      const { clues, solution } = generatePuzzle(level, seededRandom(id.length * 19))
      expect(clues).toHaveLength(rows * cols)
      expect(solution).toHaveLength(geometry.edgeCount)
      const full = cluesOf(geometry, solution)
      expect(clues.every((clue, cell) => clue === NO_CLUE || clue === full[cell])).toBe(true)
      expect(solveLogically(rows, cols, clues, level.hardest).solved).toBe(true)
      if (level.needs) {
        const easier = level.needs === 'local' ? 'basic' : 'local'
        expect(solveLogically(rows, cols, clues, easier).solved).toBe(false)
      }
      expect(findSolutions(rows, cols, clues, 2)).toEqual([solution])
    })
  }
})

describe('findHint', () => {
  const level = LEVELS.easy
  const puzzle = generatePuzzle(level, seededRandom(8))
  const { rows, cols } = level
  const blank = () => new Array<number>(geometryOf(rows, cols).edgeCount).fill(UNKNOWN)

  it('takes back wrong lines and crosses first', () => {
    const edges = blank()
    const off = puzzle.solution.indexOf(UNKNOWN)
    const on = puzzle.solution.indexOf(LINE)
    edges[off] = LINE
    edges[on] = CROSS
    expect(findHint(rows, cols, puzzle.clues, edges, puzzle.solution)).toEqual({ kind: 'wrong', edges: [Math.min(off, on), Math.max(off, on)] })
  })

  it('leads all the way through puzzles of every level', () => {
    const reasons = new Set<Reason>()
    for (const id of LEVEL_IDS) {
      const { rows: r, cols: c } = LEVELS[id]
      const { clues, solution } = generatePuzzle(LEVELS[id], seededRandom(50 + id.length))
      const edges = new Array<number>(geometryOf(r, c).edgeCount).fill(UNKNOWN)
      for (let guard = 0; guard < 2000; guard++) {
        const hint = findHint(r, c, clues, edges, solution)
        if (!hint) break
        if (hint.kind !== 'step') throw new Error('a hint called a right move wrong')
        reasons.add(hint.step.reason)
        expect(hint.step.lines.length + hint.step.crosses.length).toBeGreaterThan(0)
        for (const edge of hint.step.lines) {
          expect(solution[edge]).toBe(LINE)
          edges[edge] = LINE
        }
        for (const edge of hint.step.crosses) {
          expect(solution[edge]).toBe(UNKNOWN)
          edges[edge] = CROSS
        }
      }
      expect(isLoopDrawn(edges, solution)).toBe(true)
    }
    expect(reasons).not.toContain('reveal')
    for (const reason of ['dot-continue', 'local', 'lookahead'] as const) expect(reasons).toContain(reason)
  })
})

describe('problemsOf', () => {
  it('spots broken clues, branching dots and loops closed too soon', () => {
    const geometry = geometryOf(3, 3)
    const clues = [NO_CLUE, NO_CLUE, NO_CLUE, NO_CLUE, 1, NO_CLUE, NO_CLUE, NO_CLUE, NO_CLUE]
    const edges = new Array<number>(geometry.edgeCount).fill(UNKNOWN)
    // Two sides of the middle 1.
    edges[geometry.cellEdges[4][0]] = LINE
    edges[geometry.cellEdges[4][1]] = LINE
    expect(problemsOf(3, 3, clues, edges).cells).toEqual([4])
    // Three lines at one dot.
    const branching = new Array<number>(geometry.edgeCount).fill(UNKNOWN)
    for (const edge of geometry.dotEdges[5].slice(0, 3)) branching[edge] = LINE
    expect(problemsOf(3, 3, clues, branching).dots).toEqual([5])
    // A small loop round the top-left cell, while the 1 in the middle is unmet.
    const small = new Array<number>(geometry.edgeCount).fill(UNKNOWN)
    for (const edge of geometry.cellEdges[0]) small[edge] = LINE
    expect(problemsOf(3, 3, clues, small).loop.sort((a, b) => a - b)).toEqual([...geometry.cellEdges[0]].sort((a, b) => a - b))
  })
})
