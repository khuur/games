import { describe, expect, it } from 'vitest'
import {
  affectedCells,
  clampSize,
  countLit,
  generatePuzzle,
  isDark,
  MAX_SIZE,
  minimumDifficulty,
  MIN_SIZE,
  press,
  solve,
  type Lights,
} from './lightsOut'

/** A small seeded random generator, so failures can be reproduced. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dark = (size: number) => new Array<boolean>(size * size).fill(false)
const pressAll = (lights: Lights, cells: number[], size: number) =>
  cells.reduce<Lights>((board, cell) => press(board, cell, size), lights)

/**
 * For every position that can be reached on a small board, the fewest presses that reach it,
 * found by trying every set of presses. Positions are bit masks of lit cells.
 */
function fewestPresses(size: number): Map<number, number> {
  const n = size * size
  const patterns = Array.from({ length: n }, (_, cell) =>
    affectedCells(cell, size).reduce((bits, target) => bits | (1 << target), 0),
  )
  const fewest = new Map<number, number>()
  for (let presses = 0; presses < 2 ** n; presses++) {
    let board = 0
    let count = 0
    for (let cell = 0; cell < n; cell++) {
      if (presses & (1 << cell)) {
        board ^= patterns[cell]
        count++
      }
    }
    if (count < (fewest.get(board) ?? Infinity)) fewest.set(board, count)
  }
  return fewest
}

const fromBits = (bits: number, n: number) => Array.from({ length: n }, (_, cell) => (bits & (1 << cell)) !== 0)

describe('rules', () => {
  it('flips a light and its neighbours', () => {
    expect(press(dark(3), 4, 3)).toEqual([false, true, false, true, true, true, false, true, false])
    expect(press(dark(3), 0, 3)).toEqual([true, true, false, true, false, false, false, false, false])
    expect(affectedCells(24, 5).sort((a, b) => a - b)).toEqual([19, 23, 24])
  })

  it('cancels a press by pressing again', () => {
    const lights = generatePuzzle(5, seededRandom(1))
    expect(press(press(lights, 12, 5), 12, 5)).toEqual(lights)
  })

  it('counts lit lights and spots a dark board', () => {
    expect(countLit(press(dark(4), 5, 4))).toBe(5)
    expect(isDark(dark(4))).toBe(true)
    expect(isDark(press(dark(4), 5, 4))).toBe(false)
  })

  it('clamps the grid size', () => {
    expect(clampSize(1)).toBe(MIN_SIZE)
    expect(clampSize(12)).toBe(MAX_SIZE)
    expect(clampSize(Number.NaN)).toBeGreaterThanOrEqual(MIN_SIZE)
  })
})

describe('solver', () => {
  it.each([3, 4])('finds the fewest presses for every position on %i×%i', (size) => {
    const n = size * size
    const fewest = fewestPresses(size)
    for (let bits = 0; bits < 2 ** n; bits++) {
      const lights = fromBits(bits, n)
      const solution = solve(lights, size)
      const optimal = fewest.get(bits)
      if (optimal === undefined) {
        expect(solution).toBeNull()
        continue
      }
      expect(solution).toHaveLength(optimal)
      expect(isDark(pressAll(lights, solution!, size))).toBe(true)
    }
  })

  it('knows that some 5×5 patterns have no solution', () => {
    const corner = dark(5)
    corner[0] = true
    expect(solve(corner, 5)).toBeNull()
  })

  it('solves a dark board with no presses', () => {
    expect(solve(dark(5), 5)).toEqual([])
  })
})

describe('generatePuzzle', () => {
  it('always deals a solvable puzzle that takes a few presses', () => {
    const random = seededRandom(42)
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      for (let round = 0; round < 25; round++) {
        const lights = generatePuzzle(size, random)
        const solution = solve(lights, size)
        expect(lights).toHaveLength(size * size)
        expect(solution).not.toBeNull()
        expect(solution!.length).toBeGreaterThanOrEqual(minimumDifficulty(size))
        expect(isDark(pressAll(lights, solution!, size))).toBe(true)
      }
    }
  })
})
