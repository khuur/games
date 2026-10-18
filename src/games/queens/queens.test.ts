import { describe, expect, it } from 'vitest'
import {
  attackedBy,
  countSolutions,
  findSolutions,
  generatePuzzle,
  LEVELS,
  nextLogicalStep,
  solveLogically,
  TECHNIQUES,
  touching,
  unitsOf,
} from './queens'

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Regions from a picture: one letter per cell, a–j. */
const regionsOf = (...rows: string[]) => [...rows.join('')].map((letter) => letter.charCodeAt(0) - 97)

/** Every valid placement, by brute force over all permutations of columns. */
function bruteForce(size: number, regions: number[]): number[][] {
  const found: number[][] = []
  const permute = (columns: number[], rest: number[]) => {
    if (!rest.length) {
      const cells = columns.map((column, row) => row * size + column)
      const regionSet = new Set(cells.map((cell) => regions[cell]))
      const apart = cells.every((cell, i) => i === 0 || !touching(cell, cells[i - 1], size))
      if (regionSet.size === size && apart) found.push(cells)
      return
    }
    rest.forEach((column, i) => permute([...columns, column], [...rest.slice(0, i), ...rest.slice(i + 1)]))
  }
  permute([], Array.from({ length: size }, (_, i) => i))
  return found
}

describe('rules', () => {
  it('knows which cells touch', () => {
    expect(touching(0, 7, 6)).toBe(true)
    expect(touching(0, 2, 6)).toBe(false)
    expect(touching(5, 6, 6)).toBe(false)
    expect(touching(3, 3, 6)).toBe(false)
  })

  it('lists what a queen rules out', () => {
    const regions = regionsOf('aabb', 'aabb', 'ccdd', 'ccdd')
    expect(attackedBy(0, 4, regions).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 8, 12])
  })

  it('has rows, columns and regions as units', () => {
    const units = unitsOf(4, regionsOf('aabb', 'aabb', 'ccdd', 'ccdd'))
    expect(units).toHaveLength(12)
    expect(units[1]).toEqual([4, 5, 6, 7])
    expect(units[5]).toEqual([1, 5, 9, 13])
    expect(units[8]).toEqual([0, 1, 4, 5])
  })
})

describe('counting solutions', () => {
  it('agrees with brute force on random region maps', () => {
    const random = seededRandom(1)
    for (let trial = 0; trial < 40; trial++) {
      const size = 5 + Math.floor(random() * 2)
      // Random regions: assign each cell a region, making sure every region has a cell.
      const regions = Array.from({ length: size * size }, (_, cell) => (cell < size ? cell : Math.floor(random() * size)))
      const expected = bruteForce(size, regions)
      expect(countSolutions(size, regions, 1000)).toBe(expected.length)
      expect(findSolutions(size, regions, 1000).map((solution) => solution.join())).toEqual(expected.map((solution) => solution.join()))
    }
  })
})

describe('solving like a person', () => {
  it('only ever makes true deductions', () => {
    const random = seededRandom(2)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 4; i++) {
        const { regions, solution } = generatePuzzle(level, random)
        const queens: number[] = []
        const crossed: number[] = []
        for (let guard = 0; guard < 400 && queens.length < level.size; guard++) {
          const step = nextLogicalStep(level.size, regions, queens, crossed)
          expect(step).not.toBeNull()
          if (!step) break
          if (step.queen !== undefined) {
            expect(solution).toContain(step.queen)
            queens.push(step.queen)
          }
          for (const cell of step.eliminate ?? []) {
            expect(solution).not.toContain(cell)
            crossed.push(cell)
          }
        }
        expect(queens.sort((a, b) => a - b)).toEqual([...solution].sort((a, b) => a - b))
      }
    }
  })

  it('explains a region squeezed into one row', () => {
    // Region a sits entirely in row 0, so row 0's other cells are out.
    const regions = regionsOf('aabbb', 'ccbbb', 'ccdde', 'cddee', 'cddee')
    const step = nextLogicalStep(5, regions, [], [])
    expect(step).not.toBeNull()
    expect(['confined', 'only-spot']).toContain(step!.technique)
  })
})

describe('generatePuzzle', () => {
  it('makes puzzles with exactly one solution, graded by level', () => {
    const random = seededRandom(3)
    for (const level of Object.values(LEVELS)) {
      for (let i = 0; i < 5; i++) {
        const { regions, solution } = generatePuzzle(level, random)
        expect(regions).toHaveLength(level.size * level.size)
        expect(new Set(regions).size).toBe(level.size)
        expect(findSolutions(level.size, regions, 2)).toEqual([solution])
        const { solved, needed } = solveLogically(level.size, regions, level.hardest)
        expect(solved).toBe(true)
        if (level.needs) expect(TECHNIQUES.indexOf(needed)).toBeGreaterThanOrEqual(TECHNIQUES.indexOf(level.needs))
        // Every region is one connected piece.
        for (let region = 0; region < level.size; region++) {
          const cells = regions.flatMap((r, cell) => (r === region ? [cell] : []))
          const reached = new Set([cells[0]])
          const queue = [cells[0]]
          while (queue.length) {
            const cell = queue.pop()!
            const row = Math.floor(cell / level.size)
            const column = cell % level.size
            for (const [r, c] of [
              [row - 1, column],
              [row + 1, column],
              [row, column - 1],
              [row, column + 1],
            ]) {
              const next = r * level.size + c
              if (r >= 0 && r < level.size && c >= 0 && c < level.size && regions[next] === region && !reached.has(next)) {
                reached.add(next)
                queue.push(next)
              }
            }
          }
          expect(reached.size).toBe(cells.length)
        }
      }
    }
  })
})
