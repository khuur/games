import { describe, expect, it } from 'vitest'
import {
  bridgesAt,
  findSolutions,
  generatePuzzle,
  isConnected,
  isSolution,
  layoutOf,
  LEVELS,
  nextBridge,
  solveLogically,
  TECHNIQUES,
  type Island,
} from './bridges'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Islands from a picture: digits are islands, dots are water. */
function islandsOf(...rows: string[]): { columns: number; rows: number; islands: Island[] } {
  const islands: Island[] = []
  rows.forEach((line, row) =>
    [...line].forEach((char, column) => {
      if (char !== '.') islands.push({ cell: row * line.length + column, count: Number(char) })
    }),
  )
  return { columns: rows[0].length, rows: rows.length, islands }
}

/** Every solution, by trying all 3^links bridge counts. */
function bruteForce(layout: ReturnType<typeof layoutOf>): string[] {
  const found: string[] = []
  const counts = new Array<number>(layout.links.length).fill(0)
  const visit = (link: number) => {
    if (link === counts.length) {
      if (isSolution(layout, counts)) found.push(counts.join())
      return
    }
    for (let value = 0; value <= 2; value++) {
      counts[link] = value
      visit(link + 1)
    }
  }
  visit(0)
  return found
}

describe('layout', () => {
  it('links islands that can see each other', () => {
    const { columns, rows, islands } = islandsOf('2.2', '...', '2.2')
    const layout = layoutOf(columns, rows, islands)
    expect(layout.links).toHaveLength(4)
    expect(layout.links.filter((link) => link.horizontal)).toHaveLength(2)
    expect(layout.crossings.every((crossed) => crossed.length === 0)).toBe(true)
  })

  it('knows which links cross', () => {
    const { columns, rows, islands } = islandsOf('.1.', '1.1', '.1.')
    const layout = layoutOf(columns, rows, islands)
    expect(layout.links).toHaveLength(2)
    expect(layout.crossings[0]).toEqual([1])
    expect(layout.crossings[1]).toEqual([0])
  })

  it('checks solutions: full islands, no crossings, all connected', () => {
    const { columns, rows, islands } = islandsOf('2.2', '...', '2.2')
    const layout = layoutOf(columns, rows, islands)
    const square = layout.links.map(() => 1)
    expect(isSolution(layout, square)).toBe(true)
    expect(bridgesAt(layout, square, 0)).toBe(2)
    // Two double bridges fill every island but leave two separate pairs.
    const pairs = layout.links.map((link) => (link.horizontal ? 2 : 0))
    expect(isConnected(layout, pairs)).toBe(false)
    expect(isSolution(layout, pairs)).toBe(false)
  })
})

describe('findSolutions', () => {
  it('agrees with brute force on small random boards', () => {
    const random = seededRandom(1)
    let checked = 0
    for (let trial = 0; trial < 300 && checked < 60; trial++) {
      const columns = 4 + Math.floor(random() * 2)
      const rows = 4 + Math.floor(random() * 2)
      const islands: Island[] = []
      for (let cell = 0; cell < columns * rows; cell++) {
        if (random() < 0.3) islands.push({ cell, count: 1 + Math.floor(random() * 4) })
      }
      const layout = layoutOf(columns, rows, islands)
      if (islands.length < 2 || layout.links.length > 10) continue
      checked++
      const expected = bruteForce(layout)
      const found = findSolutions(layout, 100).map((counts) => Array.from(counts).join())
      expect(found.sort()).toEqual(expected.sort())
    }
    expect(checked).toBeGreaterThan(20)
  })
})

describe('solving like a person', () => {
  it('only ever makes true deductions, all the way to the solution', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 4; i++) {
        const { islands, solution } = generatePuzzle(level, random)
        const layout = layoutOf(level.columns, level.rows, islands)
        const counts = new Array<number>(layout.links.length).fill(0)
        for (let guard = 0; guard < 500 && !isSolution(layout, counts); guard++) {
          const next = nextBridge(layout, counts)
          expect(next).not.toBeNull()
          if (!next) break
          expect(next.step.low).toBeLessThanOrEqual(solution[next.step.link])
          counts[next.step.link] = next.step.low
        }
        expect(counts).toEqual(solution)
      }
    }
  })
})

describe('generatePuzzle', () => {
  it('makes puzzles with exactly one solution, graded by level', () => {
    const random = seededRandom(3)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 6; i++) {
        const { islands, solution } = generatePuzzle(level, random)
        expect(islands).toHaveLength(level.islands)
        const layout = layoutOf(level.columns, level.rows, islands)
        expect(isSolution(layout, solution)).toBe(true)
        expect(findSolutions(layout, 2)).toHaveLength(1)
        const { solved, needed } = solveLogically(layout, level.hardest)
        expect(solved).toBe(true)
        if (level.needs) expect(TECHNIQUES.indexOf(needed)).toBeGreaterThanOrEqual(TECHNIQUES.indexOf(level.needs))
        // Islands never touch side by side.
        const cells = new Set(islands.map((island) => island.cell))
        for (const { cell } of islands) {
          const column = cell % level.columns
          expect(cells.has(cell + level.columns)).toBe(false)
          if (column < level.columns - 1) expect(cells.has(cell + 1)).toBe(false)
        }
      }
    }
  })
})
